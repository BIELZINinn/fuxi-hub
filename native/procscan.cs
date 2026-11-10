// Lista os processos em execução: pid <TAB> memória(MB) <TAB> nome <TAB> caminho completo do .exe. Só leitura, rápido (~50 ms).
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

class ProcScan {
    [DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool QueryFullProcessImageName(IntPtr h, int flags, StringBuilder sb, ref int size);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);

    [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr p);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder sb, int max);
    [DllImport("user32.dll")] static extern int GetWindowTextLength(IntPtr h);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    delegate bool EnumProc(IntPtr h, IntPtr p);

    [DllImport("shell32.dll")] static extern int SHQueryUserNotificationState(out int state);
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
    [DllImport("user32.dll")] static extern IntPtr MonitorFromWindow(IntPtr h, uint flags);
    [DllImport("user32.dll")] static extern bool GetMonitorInfo(IntPtr m, ref MONITORINFO mi);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder sb, int max);
    [StructLayout(LayoutKind.Sequential)] struct RECT { public int L, T, R, B; }
    [StructLayout(LayoutKind.Sequential)] struct MONITORINFO { public int cb; public RECT mon, work; public uint flags; }

    // "fs": ha um aplicativo em tela cheia na frente? -> "1<TAB>nome" ou "0". Usa o estado de notificacao do Windows (jogos em tela cheia/sem bordas, apresentacoes)
    // e confere se a janela da frente cobre o monitor inteiro (ignora a area de trabalho e a barra de tarefas).
    static int Fullscreen() {
        int st = 0; try { SHQueryUserNotificationState(out st); } catch { }                 // 2 = ocupado (tela cheia), 3 = jogo D3D em tela cheia, 4 = apresentacao
        bool fs = st == 2 || st == 3 || st == 4; string name = "";
        IntPtr h = GetForegroundWindow();
        if (h != IntPtr.Zero) {
            try { uint pid; GetWindowThreadProcessId(h, out pid); name = Process.GetProcessById((int)pid).ProcessName; } catch { }
            var cls = new StringBuilder(64); GetClassName(h, cls, 64); string c = cls.ToString();
            if (c == "Progman" || c == "WorkerW" || c == "Shell_TrayWnd") fs = false;
            else if (!fs) { RECT r; var mi = new MONITORINFO(); mi.cb = Marshal.SizeOf(typeof(MONITORINFO)); IntPtr m = MonitorFromWindow(h, 2);
                if (GetWindowRect(h, out r) && m != IntPtr.Zero && GetMonitorInfo(m, ref mi)) fs = r.L <= mi.mon.L && r.T <= mi.mon.T && r.R >= mi.mon.R && r.B >= mi.mon.B; }
        }
        Console.Write((fs ? "1" : "0") + "\t" + name);
        return 0;
    }

    // "windows": janelas visíveis com título -> pid <TAB> nome do processo <TAB> título (para reconhecer jogos na nuvem pelo título da janela)
    static int Windows() {
        var o = new StringBuilder();
        EnumWindows((h, p) => {
            try {
                if (!IsWindowVisible(h)) return true;
                int n = GetWindowTextLength(h); if (n <= 0) return true;
                var sb = new StringBuilder(n + 2); GetWindowText(h, sb, sb.Capacity);
                uint pid; GetWindowThreadProcessId(h, out pid);
                string name = ""; try { name = Process.GetProcessById((int)pid).ProcessName; } catch { }
                o.Append(pid).Append('\t').Append(name).Append('\t').Append(sb.ToString().Replace('\t', ' ').Replace('\n', ' ')).Append('\n');
            } catch { }
            return true;
        }, IntPtr.Zero);
        Console.OutputEncoding = new UTF8Encoding(false);
        Console.Out.Write(o.ToString());
        return 0;
    }

    // "battery [parte-do-nome] [all]": nivel de bateria (0-100) que o Windows guarda para fones Bluetooth (HFP/BLE) -> "nome<TAB>nivel" por linha. "all" inclui dispositivos que nao estao conectados.
    [StructLayout(LayoutKind.Sequential)] struct DEVPROPKEY { public Guid fmtid; public uint pid; }
    [DllImport("cfgmgr32.dll", CharSet = CharSet.Unicode)] static extern int CM_Get_Device_ID_List_SizeW(out uint len, string filter, uint flags);
    [DllImport("cfgmgr32.dll", CharSet = CharSet.Unicode)] static extern int CM_Get_Device_ID_ListW(string filter, byte[] buf, uint len, uint flags);
    [DllImport("cfgmgr32.dll", CharSet = CharSet.Unicode)] static extern int CM_Locate_DevNodeW(out uint inst, string id, uint flags);
    [DllImport("cfgmgr32.dll", CharSet = CharSet.Unicode)] static extern int CM_Get_DevNode_PropertyW(uint inst, ref DEVPROPKEY key, out uint type, byte[] buf, ref uint size, uint flags);
    static int Battery(string[] a) {
        string part = a.Length > 1 && a[1] != "all" ? a[1].ToLower() : ""; bool all = Array.IndexOf(a, "all") >= 0;
        var bat = new DEVPROPKEY { fmtid = new Guid("104EA319-6EE2-4701-BD47-8DDBF425BBE5"), pid = 2 };
        var fn = new DEVPROPKEY { fmtid = new Guid("A45C254E-DF1C-4EFD-8020-67D146A850E0"), pid = 14 };
        var o = new StringBuilder();
        foreach (var en in new[] { "BTHENUM", "BTHLE", "BTHLEDEVICE" }) {
            uint len; if (CM_Get_Device_ID_List_SizeW(out len, en, all ? 1u : 0x101u) != 0 || len < 2) continue;
            var buf = new byte[len * 2]; if (CM_Get_Device_ID_ListW(en, buf, len, all ? 1u : 0x101u) != 0) continue;
            foreach (var id in Encoding.Unicode.GetString(buf).Split('\0')) {
                if (id.Length == 0) continue;
                uint inst; if (CM_Locate_DevNodeW(out inst, id, all ? 1u : 0u) != 0) continue;
                uint t, sz = 1; var b = new byte[1];
                if (CM_Get_DevNode_PropertyW(inst, ref bat, out t, b, ref sz, 0) != 0 || sz < 1) continue;
                string name = ""; uint t2, s2 = 512; var nb = new byte[512];
                if (CM_Get_DevNode_PropertyW(inst, ref fn, out t2, nb, ref s2, 0) == 0) name = Encoding.Unicode.GetString(nb, 0, (int)Math.Min(s2, 512)).TrimEnd('\0');
                if (part.Length > 0 && name.ToLower().IndexOf(part) < 0) continue;
                o.Append(name).Append('\t').Append((int)b[0]).Append('\n');
            }
        }
        Console.OutputEncoding = new UTF8Encoding(false); Console.Out.Write(o.ToString());
        return 0;
    }

    static int Main(string[] args) {
        if (args.Length > 0 && args[0] == "battery") return Battery(args);
        if (args.Length > 0 && args[0] == "windows") return Windows();
        if (args.Length > 0 && args[0] == "fs") return Fullscreen();
        var o = new StringBuilder();
        foreach (var p in Process.GetProcesses()) {
            try {
                string path = "";
                IntPtr h = OpenProcess(0x1000, false, p.Id);                       // PROCESS_QUERY_LIMITED_INFORMATION
                if (h != IntPtr.Zero) {
                    var sb = new StringBuilder(2048); int n = sb.Capacity;
                    if (QueryFullProcessImageName(h, 0, sb, ref n)) path = sb.ToString();
                    CloseHandle(h);
                }
                long ws = 0; try { ws = p.WorkingSet64; } catch { }
                o.Append(p.Id).Append('\t').Append(ws / 1048576).Append('\t').Append(p.ProcessName).Append('\t').Append(path).Append('\n');
            } catch { }
        }
        Console.OutputEncoding = new UTF8Encoding(false);
        Console.Out.Write(o.ToString());
        return 0;
    }
}
