// Sonda HID somente leitura. Uso:
//   hidprobe list <vid> <pid>              -> lista interfaces/coleções HID (JSON)
//   hidprobe monitor <vid> <pid> <segs>    -> mostra relatórios de entrada (botões, roda de volume...)
using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

class HidProbe {
    [StructLayout(LayoutKind.Sequential)] struct SPDID { public uint cb; public Guid g; public uint flags; public IntPtr res; }
    [StructLayout(LayoutKind.Sequential)] struct ATTR { public uint size; public ushort vid, pid, ver; }
    [StructLayout(LayoutKind.Sequential)] struct CAPS {
        public ushort Usage, UsagePage, InLen, OutLen, FeatLen;
        [MarshalAs(UnmanagedType.ByValArray, SizeConst = 17)] public ushort[] Res;
        public ushort Nodes, InBtn, InVal, InIdx, OutBtn, OutVal, OutIdx, FeatBtn, FeatVal, FeatIdx;
    }
    [DllImport("hid.dll")] static extern void HidD_GetHidGuid(out Guid g);
    [DllImport("hid.dll")] static extern bool HidD_GetAttributes(IntPtr h, ref ATTR a);
    [DllImport("hid.dll")] static extern bool HidD_GetPreparsedData(IntPtr h, out IntPtr p);
    [DllImport("hid.dll")] static extern bool HidD_FreePreparsedData(IntPtr p);
    [DllImport("hid.dll", CharSet = CharSet.Unicode)] static extern bool HidD_GetProductString(IntPtr h, StringBuilder b, int len);
    [DllImport("hid.dll")] static extern int HidP_GetCaps(IntPtr p, out CAPS c);
    [DllImport("setupapi.dll", SetLastError = true)] static extern IntPtr SetupDiGetClassDevs(ref Guid g, IntPtr e, IntPtr h, uint f);
    [DllImport("setupapi.dll", SetLastError = true)] static extern bool SetupDiEnumDeviceInterfaces(IntPtr s, IntPtr d, ref Guid g, uint i, ref SPDID data);
    [DllImport("setupapi.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool SetupDiGetDeviceInterfaceDetail(IntPtr s, ref SPDID d, IntPtr det, uint size, out uint req, IntPtr dd);
    [DllImport("setupapi.dll")] static extern bool SetupDiDestroyDeviceInfoList(IntPtr s);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern IntPtr CreateFile(string n, uint acc, uint share, IntPtr sa, uint disp, uint fl, IntPtr t);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool ReadFile(IntPtr h, byte[] b, uint n, out uint read, IntPtr o);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);

    static string J(string s) { return "\"" + s.Replace("\\", "\\\\").Replace("\"", "\\\"") + "\""; }

    static System.Collections.Generic.List<string> Paths() {
        var list = new System.Collections.Generic.List<string>();
        Guid g; HidD_GetHidGuid(out g);
        IntPtr set = SetupDiGetClassDevs(ref g, IntPtr.Zero, IntPtr.Zero, 0x12); // PRESENT | DEVICEINTERFACE
        for (uint i = 0; ; i++) {
            var d = new SPDID(); d.cb = (uint)Marshal.SizeOf(typeof(SPDID));
            if (!SetupDiEnumDeviceInterfaces(set, IntPtr.Zero, ref g, i, ref d)) break;
            uint req; SetupDiGetDeviceInterfaceDetail(set, ref d, IntPtr.Zero, 0, out req, IntPtr.Zero);
            IntPtr buf = Marshal.AllocHGlobal((int)req);
            Marshal.WriteInt32(buf, IntPtr.Size == 8 ? 8 : 6);
            if (SetupDiGetDeviceInterfaceDetail(set, ref d, buf, req, out req, IntPtr.Zero))
                list.Add(Marshal.PtrToStringUni(new IntPtr(buf.ToInt64() + 4)));
            Marshal.FreeHGlobal(buf);
        }
        SetupDiDestroyDeviceInfoList(set);
        return list;
    }

    static int Main(string[] a) {
        string mode = a.Length > 0 ? a[0] : "list";
        ushort vid = Convert.ToUInt16(a[1], 16), pid = Convert.ToUInt16(a[2], 16);
        var sb = new StringBuilder("[");
        bool first = true;
        var monitors = new System.Collections.Generic.List<string>();
        foreach (var p in Paths()) {
            IntPtr h = CreateFile(p, 0, 3, IntPtr.Zero, 3, 0, IntPtr.Zero);
            if (h == (IntPtr)(-1)) continue;
            var at = new ATTR(); at.size = (uint)Marshal.SizeOf(typeof(ATTR));
            if (!HidD_GetAttributes(h, ref at) || at.vid != vid || at.pid != pid) { CloseHandle(h); continue; }
            IntPtr pre; CAPS c = new CAPS(); string prod = "";
            if (HidD_GetPreparsedData(h, out pre)) { HidP_GetCaps(pre, out c); HidD_FreePreparsedData(pre); }
            var ps = new StringBuilder(256); if (HidD_GetProductString(h, ps, 512)) prod = ps.ToString();
            CloseHandle(h);
            if (!first) sb.Append(","); first = false;
            sb.Append("{\"path\":" + J(p) + ",\"product\":" + J(prod) + ",\"usagePage\":\"0x" + c.UsagePage.ToString("X4") + "\",\"usage\":\"0x" + c.Usage.ToString("X4") +
                "\",\"inputLen\":" + c.InLen + ",\"outputLen\":" + c.OutLen + ",\"featureLen\":" + c.FeatLen + "}");
            if (c.InLen > 0) monitors.Add(p + "|" + c.InLen);
        }
        sb.Append("]");
        if (mode == "list") { Console.Out.Write(sb.ToString()); return 0; }

        int secs = a.Length > 3 ? int.Parse(a[3]) : 15;
        foreach (var m in monitors) {
            var parts = m.Split('|'); string path = parts[0]; uint len = uint.Parse(parts[1]);
            var t = new Thread(() => {
                IntPtr h = CreateFile(path, 0x80000000, 3, IntPtr.Zero, 3, 0, IntPtr.Zero);
                if (h == (IntPtr)(-1)) { Console.WriteLine("SEM_ACESSO " + path); return; }
                var buf = new byte[len]; uint n;
                while (ReadFile(h, buf, len, out n, IntPtr.Zero))
                    Console.WriteLine(path.Substring(path.IndexOf("mi_")) + " " + BitConverter.ToString(buf, 0, (int)n));
            });
            t.IsBackground = true; t.Start();
        }
        Thread.Sleep(secs * 1000);
        return 0;
    }
}
