import { useEffect, useRef, useState } from "react";
import { Loader2, ZoomIn, ZoomOut, ExternalLink, FileWarning } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

const ext = (name: string) => (name.split(".").pop() || "").toLowerCase();
const IMG = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "heic", "heif"];

/** Renders every page of a PDF on canvases (works the same in the browser and the desktop app). */
const PdfPages = ({ url, zoom }: { url: string; zoom: number }) => {
  const box = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [pages, setPages] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const el = box.current;
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
        const pdf = await pdfjs.getDocument({ url }).promise;
        if (cancelled || !el) return;
        el.innerHTML = "";
        const n = Math.min(pdf.numPages, 60);
        setPages(pdf.numPages);
        const width = el.clientWidth || 800;
        for (let i = 1; i <= n; i++) {
          const page = await pdf.getPage(i);
          if (cancelled) return;
          const base = page.getViewport({ scale: 1 });
          const scale = (width / base.width) * (window.devicePixelRatio || 1) * 1.25;
          const vp = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          canvas.width = vp.width;
          canvas.height = vp.height;
          canvas.style.width = "100%";
          canvas.dir = "ltr"; // an RTL canvas misplaces the glyphs pdf.js draws
          canvas.className = "block bg-white shadow border rounded-md mb-4";
          canvas.setAttribute("aria-label", `עמוד ${i}`);
          el.appendChild(canvas);
          await page.render({
            canvas,
            canvasContext: canvas.getContext("2d")!,
            viewport: vp,
          }).promise;
          if (i === 1) setState("ok");
        }
        setState("ok");
      } catch {
        if (!cancelled) setState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);
  return (
    <div>
      {state === "loading" && (
        <div className="py-16 flex justify-center text-muted-foreground gap-2">
          <Loader2 className="animate-spin" /> טוען את המסמך…
        </div>
      )}
      {state === "error" && (
        <div className="py-12 text-center text-muted-foreground">
          <FileWarning className="mx-auto mb-2" /> לא הצלחנו להציג את הקובץ
        </div>
      )}
      <div ref={box} style={{ width: `${zoom}%` }} className="mx-auto" data-testid="pdf-pages" dir="ltr" />
      {pages > 60 && <p className="text-center text-xs text-muted-foreground">מוצגים 60 העמודים הראשונים מתוך {pages}</p>}
    </div>
  );
};

/** Shows an uploaded document open on the page: image or PDF; other types get a download button. */
export const DocViewer = ({ path, name }: { path: string; name: string }) => {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [zoom, setZoom] = useState(100);
  useEffect(() => {
    let alive = true;
    setUrl(null);
    setFailed(false);
    api
      .docUrl(path)
      .then((u) => alive && (u ? setUrl(u) : setFailed(true)))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [path]);
  const e = ext(name) || ext(path);
  const kind = e === "pdf" ? "pdf" : IMG.includes(e) ? "image" : "other";

  if (failed)
    return (
      <div className="py-12 text-center text-muted-foreground">
        <FileWarning className="mx-auto mb-2" /> אין הרשאה לצפות בקובץ, או שהוא נמחק
      </div>
    );
  if (!url)
    return (
      <div className="py-16 flex justify-center text-muted-foreground gap-2">
        <Loader2 className="animate-spin" /> טוען…
      </div>
    );
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-center gap-1 print:hidden">
        {kind !== "other" && (
          <>
            <Button size="icon" variant="outline" className="size-8" onClick={() => setZoom((z) => Math.max(50, z - 25))} aria-label="הקטנה">
              <ZoomOut size={15} />
            </Button>
            <span className="text-xs w-12 text-center tabular-nums">{zoom}%</span>
            <Button size="icon" variant="outline" className="size-8" onClick={() => setZoom((z) => Math.min(250, z + 25))} aria-label="הגדלה">
              <ZoomIn size={15} />
            </Button>
          </>
        )}
        <Button size="sm" variant="ghost" asChild>
          <a href={url} target="_blank" rel="noreferrer">
            <ExternalLink size={14} /> פתיחה בחלון נפרד
          </a>
        </Button>
      </div>
      <div className="overflow-auto">
        {kind === "image" && <img src={url} alt={name} style={{ width: `${zoom}%` }} className="mx-auto block rounded-md border shadow bg-white" />}
        {kind === "pdf" && <PdfPages url={url} zoom={zoom} />}
        {kind === "other" && (
          <div className="py-12 text-center text-muted-foreground space-y-3">
            <p>אי אפשר להציג קובץ מסוג {e || "זה"} בתוך המערכת.</p>
            <Button asChild>
              <a href={url} target="_blank" rel="noreferrer">
                הורדת הקובץ
              </a>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};
