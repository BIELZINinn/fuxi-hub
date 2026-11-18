// loopcap: captura o áudio do Windows (o que toca nas caixas/fone) e, opcionalmente, o microfone, e despeja PCM cru em stdout.
// Saída: s16le, 48000 Hz. "sys" = 2 canais (sistema). "both" = 4 canais (L R do sistema, L R do microfone). Sempre no ritmo do relógio,
// preenchendo silêncio quando nada toca, para o ffmpeg nunca perder a sincronia com o vídeo.
using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Diagnostics;
using System.Threading;

[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumeratorCom { }
[ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator { int EnumAudioEndpoints(int f, int s, out IntPtr d); [PreserveSig] int GetDefaultAudioEndpoint(int flow, int role, out IMMDevice dev); }
[ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice { [PreserveSig] int Activate(ref Guid iid, int ctx, IntPtr p, [MarshalAs(UnmanagedType.IUnknown)] out object o); }
[ComImport, Guid("1CB9AD4C-DBFA-4c32-B178-C2F568A703B2"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioClient {
  [PreserveSig] int Initialize(int shareMode, int flags, long hnsBuf, long hnsPeriod, IntPtr fmt, IntPtr sess);
  [PreserveSig] int GetBufferSize(out uint n);
  [PreserveSig] int GetStreamLatency(out long l);
  [PreserveSig] int GetCurrentPadding(out uint n);
  [PreserveSig] int IsFormatSupported(int mode, IntPtr fmt, out IntPtr closest);
  [PreserveSig] int GetMixFormat(out IntPtr fmt);
  [PreserveSig] int GetDevicePeriod(out long def, out long min);
  [PreserveSig] int Start();
  [PreserveSig] int Stop();
  [PreserveSig] int Reset();
  [PreserveSig] int SetEventHandle(IntPtr h);
  [PreserveSig] int GetService(ref Guid iid, [MarshalAs(UnmanagedType.IUnknown)] out object o);
}
[ComImport, Guid("C8ADBD64-E71E-48a0-A4DE-185C395CD317"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioCaptureClient {
  [PreserveSig] int GetBuffer(out IntPtr data, out uint frames, out uint flags, out ulong devPos, out ulong qpcPos);
  [PreserveSig] int ReleaseBuffer(uint frames);
  [PreserveSig] int GetNextPacketSize(out uint n);
}

class Cap {
  public IAudioClient client; public IAudioCaptureClient cap; public int rate, ch, bits; public bool isFloat;
  public double pos = 0; public float prevL = 0, prevR = 0;
  public List<float> q = new List<float>();          // L,R intercalados, já a 48 kHz
  public bool mono;

  public static Cap Open(bool loopback) {
    IMMDeviceEnumerator en = (IMMDeviceEnumerator)new MMDeviceEnumeratorCom();
    IMMDevice dev; if (en.GetDefaultAudioEndpoint(loopback ? 0 : 1, 0, out dev) != 0 || dev == null) return null;
    Guid ia = new Guid("1CB9AD4C-DBFA-4c32-B178-C2F568A703B2"); object o;
    if (dev.Activate(ref ia, 23, IntPtr.Zero, out o) != 0) return null;
    Cap c = new Cap(); c.client = (IAudioClient)o;
    IntPtr f; if (c.client.GetMixFormat(out f) != 0) return null;
    int tag = Marshal.ReadInt16(f, 0); c.ch = Marshal.ReadInt16(f, 2); c.rate = Marshal.ReadInt32(f, 4); c.bits = Marshal.ReadInt16(f, 14);
    c.isFloat = tag == 3;
    if (tag == unchecked((short)0xFFFE)) { c.isFloat = Marshal.ReadInt32(f, 24) == 3; }
    c.mono = c.ch == 1;
    if (c.client.Initialize(0, loopback ? 0x00020000 : 0, 10000000, 0, f, IntPtr.Zero) != 0) return null;
    Guid ic = new Guid("C8ADBD64-E71E-48a0-A4DE-185C395CD317"); object o2;
    if (c.client.GetService(ref ic, out o2) != 0) return null;
    c.cap = (IAudioCaptureClient)o2; c.client.Start(); return c;
  }

  float Sample(IntPtr p, int frame, int chan) {
    int idx = frame * ch + chan;
    if (isFloat && bits == 32) { byte[] b = new byte[4]; Marshal.Copy(IntPtr.Add(p, idx * 4), b, 0, 4); return BitConverter.ToSingle(b, 0); }
    if (bits == 16) return Marshal.ReadInt16(p, idx * 2) / 32768f;
    if (bits == 24) { int b0 = Marshal.ReadByte(p, idx * 3), b1 = Marshal.ReadByte(p, idx * 3 + 1), b2 = (sbyte)Marshal.ReadByte(p, idx * 3 + 2); return ((b2 << 16) | (b1 << 8) | b0) / 8388608f; }
    if (bits == 32) return Marshal.ReadInt32(p, idx * 4) / 2147483648f;
    return 0f;
  }

  public void Pump() {
    uint n;
    while (cap.GetNextPacketSize(out n) == 0 && n > 0) {
      IntPtr data; uint frames, flags; ulong a, b;
      if (cap.GetBuffer(out data, out frames, out flags, out a, out b) != 0) return;
      int nf = (int)frames; float[] L = new float[nf + 1], R = new float[nf + 1];
      L[0] = prevL; R[0] = prevR;
      bool silent = (flags & 2) != 0;
      for (int i = 0; i < nf; i++) {
        float l = 0, r = 0;
        if (!silent) { l = Sample(data, i, 0); r = ch > 1 ? Sample(data, i, 1) : l; }
        L[i + 1] = l; R[i + 1] = r;
      }
      cap.ReleaseBuffer(frames);
      double ratio = rate / 48000.0;
      while (pos < nf) {
        int i = (int)pos; double fr = pos - i;
        q.Add((float)(L[i] * (1 - fr) + L[i + 1] * fr)); q.Add((float)(R[i] * (1 - fr) + R[i + 1] * fr));
        pos += ratio;
      }
      pos -= nf; prevL = L[nf]; prevR = R[nf];
      if (q.Count > 48000 * 2 / 2) q.RemoveRange(0, q.Count - 48000 * 2 / 2);   // no máx. ~0,5 s de atraso acumulado: descarta o excesso
    }
  }
}

class P {
  static short S(float v) { if (v > 1f) v = 1f; if (v < -1f) v = -1f; return (short)(v * 32767f); }
  static int Main(string[] a) {
    bool both = a.Length > 0 && a[0] == "both";
    Cap sys = Cap.Open(true); Cap mic = both ? Cap.Open(false) : null;
    if (sys == null) { Console.Error.WriteLine("sem dispositivo de audio"); return 2; }
    Stream o = Console.OpenStandardOutput(); Stopwatch sw = Stopwatch.StartNew(); long outFrames = 0; int chans = both ? 4 : 2;
    try {
      while (true) {
        sys.Pump(); if (mic != null) mic.Pump();
        long want = sw.ElapsedMilliseconds * 48 - outFrames;
        if (want >= 480) {                                  // escreve em blocos de >=10 ms
          int n = (int)want; byte[] buf = new byte[n * chans * 2]; int bi = 0;
          int takeS = Math.Min(n, sys.q.Count / 2), takeM = mic == null ? 0 : Math.Min(n, mic.q.Count / 2);
          for (int i = 0; i < n; i++) {
            float l = 0, r = 0, ml = 0, mr = 0;
            if (i < takeS) { l = sys.q[i * 2]; r = sys.q[i * 2 + 1]; }
            if (i < takeM) { ml = mic.q[i * 2]; mr = mic.q[i * 2 + 1]; }
            short s0 = S(l), s1 = S(r);
            buf[bi++] = (byte)(s0 & 255); buf[bi++] = (byte)((s0 >> 8) & 255); buf[bi++] = (byte)(s1 & 255); buf[bi++] = (byte)((s1 >> 8) & 255);
            if (both) { short m0 = S(ml), m1 = S(mr); buf[bi++] = (byte)(m0 & 255); buf[bi++] = (byte)((m0 >> 8) & 255); buf[bi++] = (byte)(m1 & 255); buf[bi++] = (byte)((m1 >> 8) & 255); }
          }
          sys.q.RemoveRange(0, takeS * 2); if (mic != null) mic.q.RemoveRange(0, takeM * 2);
          o.Write(buf, 0, buf.Length); o.Flush(); outFrames += n;
        }
        Thread.Sleep(4);
      }
    } catch (IOException) { return 0; }
  }
}
