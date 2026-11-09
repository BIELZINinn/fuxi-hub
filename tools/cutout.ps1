# Recorta o fundo branco de uma foto do fone e encaixa na mesma caixa da hero.png (sem esticar).
# Uso: powershell -File tools/cutout.ps1 <foto.png> <saida.png>     (só para fotos de fone escuro: remove TODO pixel quase branco)
param([string]$Src, [string]$Dst)
$cs = @'
using System; using System.Drawing; using System.Drawing.Imaging; using System.Drawing.Drawing2D; using System.Runtime.InteropServices;
public static class Cut2 {
  static byte[] Load(Bitmap b, out int stride){ var d=b.LockBits(new Rectangle(0,0,b.Width,b.Height),ImageLockMode.ReadOnly,PixelFormat.Format32bppArgb); stride=d.Stride; var px=new byte[d.Stride*b.Height]; Marshal.Copy(d.Scan0,px,0,px.Length); b.UnlockBits(d); return px; }
  public static int[] Bbox(string f){ using(var b=new Bitmap(f)){ int s; var px=Load(b,out s); int x0=b.Width,y0=b.Height,x1=0,y1=0; for(int y=0;y<b.Height;y++)for(int x=0;x<b.Width;x++) if(px[y*s+x*4+3]>20){ if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y; } return new int[]{x0,y0,x1,y1}; } }
  public static void Run(string src, string dst, int W, int H, int[] box){
    using(var b=new Bitmap(src)){
      int w=b.Width,h=b.Height,s; var px=Load(b,out s);
      var bg=new bool[w*h];
      for(int y=0;y<h;y++)for(int x=0;x<w;x++){ int o=y*s+x*4; bg[y*w+x]=Math.Min(px[o],Math.Min(px[o+1],px[o+2]))>232; }
      var outp=new byte[w*h*4]; int x0=w,y0=h,x1=0,y1=0;
      for(int y=0;y<h;y++)for(int x=0;x<w;x++){
        int o=y*s+x*4, p=y*w+x, t=p*4; double a=255;
        if(bg[p]) a=0; else { bool edge=false; for(int dy=-2;dy<=2&&!edge;dy++)for(int dx=-2;dx<=2;dx++){ int xx=x+dx,yy=y+dy; if(xx>=0&&yy>=0&&xx<w&&yy<h&&bg[yy*w+xx]){edge=true;break;} }
          if(edge){ double L=0.299*px[o+2]+0.587*px[o+1]+0.114*px[o]; a=Math.Max(0,Math.Min(255,(250-L)/70.0*255)); } }
        outp[t]=px[o]; outp[t+1]=px[o+1]; outp[t+2]=px[o+2]; outp[t+3]=(byte)a;
        if(a>20){ if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y; }
      }
      using(var cut=new Bitmap(w,h,PixelFormat.Format32bppArgb)){
        var d=cut.LockBits(new Rectangle(0,0,w,h),ImageLockMode.WriteOnly,PixelFormat.Format32bppArgb); Marshal.Copy(outp,0,d.Scan0,outp.Length); cut.UnlockBits(d);
        double bw=box[2]-box[0]+1, bh=box[3]-box[1]+1, cw=x1-x0+1, ch=y1-y0+1, k=Math.Min(bw/cw,bh/ch);
        double dw=cw*k, dh=ch*k, dx2=box[0]+(bw-dw)/2, dy2=box[1]+(bh-dh)/2;
        using(var o2=new Bitmap(W,H,PixelFormat.Format32bppArgb)) using(var g=Graphics.FromImage(o2)){
          g.InterpolationMode=InterpolationMode.HighQualityBicubic; g.PixelOffsetMode=PixelOffsetMode.HighQuality; g.SmoothingMode=SmoothingMode.HighQuality;
          g.DrawImage(cut,new RectangleF((float)dx2,(float)dy2,(float)dw,(float)dh),new RectangleF(x0,y0,(float)cw,(float)ch),GraphicsUnit.Pixel);
          o2.Save(dst,ImageFormat.Png);
        }
      }
    }
  }
}
'@
Add-Type -TypeDefinition $cs -ReferencedAssemblies System.Drawing
$root = Split-Path $PSScriptRoot -Parent
$box = [Cut2]::Bbox("$root\assets\fuxi\hero.png")
[Cut2]::Run($Src, $Dst, 1748, 1676, $box)
