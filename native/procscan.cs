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

    static int Main(string[] args) {
        if (args.Length > 0 && args[0] == "windows") return Windows();
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
