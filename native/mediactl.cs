// Lê e controla a mídia do Windows (a mesma que aparece no painel de volume): Spotify, YouTube no navegador, etc.
//   mediactl info            -> JSON com a sessão atual: app, título, artista, estado, capa (data URL pequena)
//   mediactl cmd <play|pause|toggle|next|prev> [trecho-do-app]
using System;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Windows.Media.Control;
using Windows.Storage.Streams;

class P {
  static string J(string s) { if (s == null) return "\"\""; var sb = new StringBuilder("\""); foreach (var c in s) { if (c == '"' || c == '\\') sb.Append('\\').Append(c); else if (c < 32) sb.Append(' '); else sb.Append(c); } return sb.Append('"').ToString(); }
  static T Await<T>(Windows.Foundation.IAsyncOperation<T> op) { int n = 0; while (op.Status == Windows.Foundation.AsyncStatus.Started && n++ < 500) System.Threading.Thread.Sleep(10); return op.GetResults(); }
  static GlobalSystemMediaTransportControlsSession Pick(GlobalSystemMediaTransportControlsSessionManager m, string hint) {
    var all = m.GetSessions().ToList();
    if (!string.IsNullOrEmpty(hint)) { var h = all.FirstOrDefault(s => s.SourceAppUserModelId.ToLower().Contains(hint.ToLower())); if (h != null) return h; }
    var playing = all.FirstOrDefault(s => s.GetPlaybackInfo().PlaybackStatus == GlobalSystemMediaTransportControlsSessionPlaybackStatus.Playing);
    return playing ?? m.GetCurrentSession() ?? all.FirstOrDefault();
  }
  static int Main(string[] a) {
    try {
      var m = Await(GlobalSystemMediaTransportControlsSessionManager.RequestAsync());
      string mode = a.Length > 0 ? a[0] : "info";
      if (mode == "cmd") {
        var s = Pick(m, a.Length > 2 ? a[2] : null); if (s == null) { Console.Write("none"); return 1; }
        string c = a.Length > 1 ? a[1] : "toggle"; bool ok = false;
        if (c == "play") ok = Await(s.TryPlayAsync()); else if (c == "pause") ok = Await(s.TryPauseAsync()); else if (c == "next") ok = Await(s.TrySkipNextAsync()); else if (c == "prev") ok = Await(s.TrySkipPreviousAsync()); else ok = Await(s.TryTogglePlayPauseAsync());
        Console.Write(ok ? "ok" : "fail"); return 0;
      }
      var sess = m.GetSessions().ToList();
      var cur = Pick(m, a.Length > 1 ? a[1] : null);
      if (cur == null) { Console.Write("{\"sessions\":0}"); return 0; }
      var p = Await(cur.TryGetMediaPropertiesAsync()); var info = cur.GetPlaybackInfo();
      string art = "";
      bool noart = a.Length > 2 && a[2] == "noart";
      try { if (!noart)
        if (p.Thumbnail != null) {
          var st = Await(p.Thumbnail.OpenReadAsync()); var sz = (int)Math.Min(st.Size, 400000);
          if (sz > 0) { var rd = new DataReader(st); Await(rd.LoadAsync((uint)sz)); var bytes = new byte[sz]; rd.ReadBytes(bytes); art = "data:" + (string.IsNullOrEmpty(st.ContentType) ? "image/jpeg" : st.ContentType) + ";base64," + Convert.ToBase64String(bytes); }
        }
      } catch { }
      var ctl = info.Controls;
      Console.Write("{\"sessions\":" + sess.Count + ",\"app\":" + J(cur.SourceAppUserModelId) + ",\"title\":" + J(p.Title) + ",\"artist\":" + J(p.Artist) + ",\"album\":" + J(p.AlbumTitle) +
        ",\"status\":" + J(info.PlaybackStatus.ToString()) + ",\"canNext\":" + (ctl.IsNextEnabled ? "true" : "false") + ",\"canPrev\":" + (ctl.IsPreviousEnabled ? "true" : "false") + ",\"art\":" + J(art) + "}");
      return 0;
    } catch (Exception e) { Console.Write("{\"error\":" + J(e.Message) + "}"); return 2; }
  }
}
