// Mixer de volume por aplicativo (Windows Core Audio). Uso:
//   audiohelper list | set <pid> <0-100> | mute <pid> <0|1> | master <0-100> | mastermute <0|1>
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumeratorCom { }

[ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator {
    [PreserveSig] int EnumAudioEndpoints(int flow, int mask, out IntPtr c);
    [PreserveSig] int GetDefaultAudioEndpoint(int flow, int role, out IMMDevice d);
    [PreserveSig] int GetDevice([MarshalAs(UnmanagedType.LPWStr)] string id, out IMMDevice d);
}
[ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice {
    [PreserveSig] int Activate(ref Guid iid, int ctx, IntPtr p, [MarshalAs(UnmanagedType.IUnknown)] out object o);
    [PreserveSig] int OpenPropertyStore(int access, out IntPtr ps);
    [PreserveSig] int GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);
}
[ComImport, Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioSessionManager2 {
    [PreserveSig] int GetAudioSessionControl(IntPtr g, int f, out IntPtr c);
    [PreserveSig] int GetSimpleAudioVolume(IntPtr g, int f, out IntPtr v);
    [PreserveSig] int GetSessionEnumerator(out IAudioSessionEnumerator e);
}
[ComImport, Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioSessionEnumerator {
    [PreserveSig] int GetCount(out int n);
    [PreserveSig] int GetSession(int i, out IAudioSessionControl2 s);
}
[ComImport, Guid("BFB7FF88-7239-4FC9-8FA2-07C950BE9C6D"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioSessionControl2 {
    [PreserveSig] int GetState(out int s);
    [PreserveSig] int GetDisplayName([MarshalAs(UnmanagedType.LPWStr)] out string n);
    [PreserveSig] int SetDisplayName([MarshalAs(UnmanagedType.LPWStr)] string n, ref Guid c);
    [PreserveSig] int GetIconPath([MarshalAs(UnmanagedType.LPWStr)] out string p);
    [PreserveSig] int SetIconPath([MarshalAs(UnmanagedType.LPWStr)] string p, ref Guid c);
    [PreserveSig] int GetGroupingParam(out Guid g);
    [PreserveSig] int SetGroupingParam(ref Guid g, ref Guid c);
    [PreserveSig] int RegisterAudioSessionNotification(IntPtr n);
    [PreserveSig] int UnregisterAudioSessionNotification(IntPtr n);
    [PreserveSig] int GetSessionIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string id);
    [PreserveSig] int GetSessionInstanceIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string id);
    [PreserveSig] int GetProcessId(out uint pid);
    [PreserveSig] int IsSystemSoundsSession();
    [PreserveSig] int SetDuckingPreference(bool d);
}
[ComImport, Guid("87CE5498-68D6-44E5-9215-6DA47EF883D8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface ISimpleAudioVolume {
    [PreserveSig] int SetMasterVolume(float v, ref Guid c);
    [PreserveSig] int GetMasterVolume(out float v);
    [PreserveSig] int SetMute(bool m, ref Guid c);
    [PreserveSig] int GetMute(out bool m);
}
[ComImport, Guid("C02216F6-8C67-4B5B-9D00-D008E73E0064"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioMeterInformation {
    [PreserveSig] int GetPeakValue(out float p);
}
[ComImport, Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume {
    [PreserveSig] int RegisterControlChangeNotify(IntPtr n);
    [PreserveSig] int UnregisterControlChangeNotify(IntPtr n);
    [PreserveSig] int GetChannelCount(out uint c);
    [PreserveSig] int SetMasterVolumeLevel(float l, ref Guid c);
    [PreserveSig] int SetMasterVolumeLevelScalar(float l, ref Guid c);
    [PreserveSig] int GetMasterVolumeLevel(out float l);
    [PreserveSig] int GetMasterVolumeLevelScalar(out float l);
    [PreserveSig] int SetChannelVolumeLevel(uint ch, float l, ref Guid c);
    [PreserveSig] int SetChannelVolumeLevelScalar(uint ch, float l, ref Guid c);
    [PreserveSig] int GetChannelVolumeLevel(uint ch, out float l);
    [PreserveSig] int GetChannelVolumeLevelScalar(uint ch, out float l);
    [PreserveSig] int SetMute(bool m, ref Guid c);
    [PreserveSig] int GetMute(out bool m);
}

// Interface não documentada que o próprio Windows usa para trocar o dispositivo padrão (a mesma que o painel de Som e apps como o SoundSwitch usam).
[ComImport, Guid("F8679F50-850A-41CF-9C72-430F290290C8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IPolicyConfig {
    [PreserveSig] int GetMixFormat(IntPtr n, IntPtr f);
    [PreserveSig] int GetDeviceFormat(IntPtr n, int d, IntPtr f);
    [PreserveSig] int ResetDeviceFormat(IntPtr n);
    [PreserveSig] int SetDeviceFormat(IntPtr n, IntPtr a, IntPtr b);
    [PreserveSig] int GetProcessingPeriod(IntPtr n, int d, IntPtr a, IntPtr b);
    [PreserveSig] int SetProcessingPeriod(IntPtr n, IntPtr a);
    [PreserveSig] int GetShareMode(IntPtr n, IntPtr m);
    [PreserveSig] int SetShareMode(IntPtr n, IntPtr m);
    [PreserveSig] int GetPropertyValue(IntPtr n, int b, IntPtr k, IntPtr v);
    [PreserveSig] int SetPropertyValue(IntPtr n, int b, IntPtr k, IntPtr v);
    [PreserveSig] int SetDefaultEndpoint([MarshalAs(UnmanagedType.LPWStr)] string id, int role);
    [PreserveSig] int SetEndpointVisibility(IntPtr n, int v);
}
[ComImport, Guid("870AF99C-171D-4F9E-AF0D-E63DF40C2BC9")] class PolicyConfigClient { }

class AudioHelper {
    static Guid NoCtx = Guid.Empty;
    static T Act<T>(IMMDevice d, Guid iid) {
        object o; d.Activate(ref iid, 23, IntPtr.Zero, out o); return (T)o;
    }
    static string J(string s) { return "\"" + s.Replace("\\", "\\\\").Replace("\"", "\\\"") + "\"";  }
    static string F(float f) { return f.ToString("0.###", System.Globalization.CultureInfo.InvariantCulture); }

    static int Main(string[] a) {
        try {
            var en = (IMMDeviceEnumerator)new MMDeviceEnumeratorCom();
            if (a.Length > 0 && a[0].StartsWith("mic")) {      // microfone padrão: mic | micvol <0-100> | micmute <0|1>
                IMMDevice md; en.GetDefaultAudioEndpoint(1, 0, out md);
                if (md == null) { Console.Out.Write("{\"error\":\"sem microfone\"}"); return 0; }
                var mcv = Act<IAudioEndpointVolume>(md, new Guid("5CDF2C82-841E-4546-9722-0CF74078229A"));
                if (a[0] == "micvol") { mcv.SetMasterVolumeLevelScalar(float.Parse(a[1]) / 100f, ref NoCtx); return 0; }
                if (a[0] == "micmute") { mcv.SetMute(a[1] == "1", ref NoCtx); return 0; }
                var mmt = Act<IAudioMeterInformation>(md, new Guid("C02216F6-8C67-4B5B-9D00-D008E73E0064"));
                float mvol, mpk = 0; bool mmu; mcv.GetMasterVolumeLevelScalar(out mvol); mcv.GetMute(out mmu);
                for (int i = 0; i < 6; i++) { float p; mmt.GetPeakValue(out p); if (p > mpk) mpk = p; System.Threading.Thread.Sleep(40); }
                Console.Out.Write("{\"volume\":" + F(mvol) + ",\"mute\":" + (mmu ? "true" : "false") + ",\"peak\":" + F(mpk) + "}");
                return 0;
            }
            if (a.Length > 1 && a[0] == "setdefault") {        // setdefault <id do dispositivo>: vira a saída/entrada padrão (console, mídia e comunicação)
                IMMDevice chk; int hrc = en.GetDevice(a[1], out chk);
                if (hrc != 0 || chk == null) { Console.Out.Write("error:dispositivo nao encontrado"); return 1; }
                var pc = (IPolicyConfig)new PolicyConfigClient();
                int bad = 0;
                for (int r = 0; r < 3; r++) { int hr2 = pc.SetDefaultEndpoint(a[1], r); if (hr2 != 0) bad = hr2; }
                Console.Out.Write(bad == 0 ? "ok" : "error:" + bad); return bad == 0 ? 0 : 1;
            }
            if (a.Length > 0 && a[0] == "defaults") {          // ids dos dispositivos padrão (0=saída, 1=entrada; funções console/mídia/comunicação)
                var sbd = new StringBuilder("{");
                string[] fl = { "render", "capture" }; string[] ro = { "console", "media", "comm" };
                for (int f = 0; f < 2; f++) for (int r = 0; r < 3; r++) {
                    IMMDevice dd; string id = "";
                    if (en.GetDefaultAudioEndpoint(f, r, out dd) == 0 && dd != null) dd.GetId(out id);
                    sbd.Append((f + r > 0 ? "," : "") + J(fl[f] + "_" + ro[r]) + ":" + J(id));
                }
                Console.Out.Write(sbd.Append("}").ToString()); return 0;
            }
            if (a.Length > 1 && a[0] == "capinfo") {          // diagnóstico (só leitura): volume, mudo e pico de um microfone
                IMMDevice cd; int hr = en.GetDevice("{0.0.1.00000000}.{" + a[1] + "}", out cd);
                if (hr != 0 || cd == null) { Console.Out.Write("{\"error\":\"dispositivo nao encontrado\"}"); return 0; }
                var cv = Act<IAudioEndpointVolume>(cd, new Guid("5CDF2C82-841E-4546-9722-0CF74078229A"));
                var mt = Act<IAudioMeterInformation>(cd, new Guid("C02216F6-8C67-4B5B-9D00-D008E73E0064"));
                float vol; bool muted; cv.GetMasterVolumeLevelScalar(out vol); cv.GetMute(out muted);
                float peak = 0; int secs = a.Length > 2 ? int.Parse(a[2]) : 4;
                for (int i = 0; i < secs * 20; i++) { float p; mt.GetPeakValue(out p); if (p > peak) peak = p; System.Threading.Thread.Sleep(50); }
                Console.Out.Write("{\"volume\":" + F(vol) + ",\"mute\":" + (muted ? "true" : "false") + ",\"peak\":" + F(peak) + "}");
                return 0;
            }
            IMMDevice dev; en.GetDefaultAudioEndpoint(0, 0, out dev);
            var ep = Act<IAudioEndpointVolume>(dev, new Guid("5CDF2C82-841E-4546-9722-0CF74078229A"));
            var mgr = Act<IAudioSessionManager2>(dev, new Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"));
            string cmd = a.Length > 0 ? a[0] : "list";

            if (cmd == "master") { ep.SetMasterVolumeLevelScalar(float.Parse(a[1]) / 100f, ref NoCtx); return 0; }
            if (cmd == "mastermute") { ep.SetMute(a[1] == "1", ref NoCtx); return 0; }

            IAudioSessionEnumerator en2; mgr.GetSessionEnumerator(out en2);
            int n; en2.GetCount(out n);

            if (cmd == "set" || cmd == "mute") {
                uint want = uint.Parse(a[1]);
                for (int i = 0; i < n; i++) {
                    IAudioSessionControl2 s; en2.GetSession(i, out s);
                    uint pid; s.GetProcessId(out pid);
                    if (pid != want) continue;
                    var v = (ISimpleAudioVolume)s;
                    if (cmd == "set") v.SetMasterVolume(float.Parse(a[2]) / 100f, ref NoCtx);
                    else v.SetMute(a[2] == "1", ref NoCtx);
                }
                return 0;
            }

            float mv; bool mm; ep.GetMasterVolumeLevelScalar(out mv); ep.GetMute(out mm);
            var seen = new Dictionary<uint, string>();
            var sb = new StringBuilder();
            sb.Append("{\"master\":{\"volume\":" + F(mv) + ",\"mute\":" + (mm ? "true" : "false") + "},\"sessions\":[");
            bool first = true;
            for (int i = 0; i < n; i++) {
                IAudioSessionControl2 s; en2.GetSession(i, out s);
                int st; s.GetState(out st);
                uint pid; s.GetProcessId(out pid);
                if (st == 2 || seen.ContainsKey(pid)) continue;
                seen[pid] = "";
                string name = "Sons do sistema";
                if (pid != 0) { try { name = Process.GetProcessById((int)pid).ProcessName; } catch { continue; } }
                var v = (ISimpleAudioVolume)s; float vol; bool mute; v.GetMasterVolume(out vol); v.GetMute(out mute);
                float peak = 0; try { ((IAudioMeterInformation)s).GetPeakValue(out peak); } catch { }
                if (!first) sb.Append(","); first = false;
                sb.Append("{\"pid\":" + pid + ",\"name\":" + J(name) + ",\"volume\":" + F(vol) + ",\"mute\":" + (mute ? "true" : "false") + ",\"peak\":" + F(peak) + ",\"active\":" + (st == 1 ? "true" : "false") + "}");
            }
            sb.Append("]}");
            Console.Out.Write(sb.ToString());
            return 0;
        } catch (Exception e) { Console.Error.WriteLine(e.Message); return 1; }
    }
}
