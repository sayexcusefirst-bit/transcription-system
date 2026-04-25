'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getDocument, getPage, updatePage, getPagesForDocument } from '@/lib/db';
import { 
  ChevronLeft, 
  ChevronRight, 
  ZoomIn, 
  ZoomOut, 
  CheckCircle2, 
  Download, 
  LayoutGrid,
  Clock,
  AlertCircle,
  Home,
  Settings,
  HelpCircle,
  Eye,
  EyeOff,
  Play,
  Square,
  Loader2
} from 'lucide-react';
// pdfjsLib and docx will be imported dynamically
let pdfjsLib: any = null;
import KeyboardReference from '@/components/KeyboardReference';

export default function WorkspacePage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  
  const [doc, setDoc] = useState<any>(null);
  const [currentPageNum, setCurrentPageNum] = useState(1);
  const [pageData, setPageData] = useState<any>(null);
  const [allPages, setAllPages] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [zoom, setZoom] = useState(1.0);
  const [showChecklist, setShowChecklist] = useState(false);
  const [showPageMap, setShowPageMap] = useState(false);
  const [showKeyboardRef, setShowKeyboardRef] = useState(false);
  const [showFocusMode, setShowFocusMode] = useState(false);
  const [focusPosition, setFocusPosition] = useState(100); // Percentage or px
  const [fontLoaded, setFontLoaded] = useState(true);
  const [checklist, setChecklist] = useState<Record<string, boolean>>({
    allLines: false,
    lineBreaks: false,
    symbols: false,
    noMissing: false,
    englishUnchanged: false
  });
  const [pasteDetected, setPasteDetected] = useState(false);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const pdfRef = useRef<any>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const startTimeRef = useRef<number>(Date.now());
  const baseScaleRef = useRef<number>(1.5);
  const typingRef = useRef<boolean>(false); // controls typing animation
  const [isTyping, setIsTyping] = useState(false);
  const [typingProgress, setTypingProgress] = useState(0);
  const [showComplete, setShowComplete] = useState(false);

  // Check font loading
  useEffect(() => {
    if (typeof document !== 'undefined') {
        document.fonts.load('12px KrishnaWide').then(fonts => {
            if (fonts.length === 0) {
                setFontLoaded(false);
            }
        });
    }
  }, []);

  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      try {
        pdfjsLib = await import('pdfjs-dist');
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@5.6.205/build/pdf.worker.min.mjs';

        const document = await getDocument(id);
        if (!document) {
          router.push('/');
          return;
        }
        setDoc(document);
        
        const arrayBuffer = await document.pdfBlob.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer, useWorkerFetch: false, isEvalSupported: false, useSystemFonts: true }).promise;
        pdfRef.current = pdf;
        
        const pages = await getPagesForDocument(id);
        setAllPages(pages.sort((a, b) => a.pageNumber - b.pageNumber));

        // Load page data but DON'T render yet (viewer not mounted)
        const data = await getPage(id, 1);
        setPageData(data);
        setCurrentPageNum(1);
        setPasteDetected((data?.pasteEvents || 0) > 0);
        startTimeRef.current = Date.now();
      } catch (error) {
        console.error('Error loading workspace:', error);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, [id, router]);

  // Render PDF AFTER loading completes and viewer is mounted
  const [needsFirstRender, setNeedsFirstRender] = useState(true);
  useEffect(() => {
    if (!isLoading && pdfRef.current && viewerRef.current && needsFirstRender) {
      setNeedsFirstRender(false);
      renderPdfPage(currentPageNum, true);
    }
  }, [isLoading, needsFirstRender]);

  // Sync contentEditable DOM manually to avoid React overwrite during animation
  useEffect(() => {
    if (editorRef.current && !isTyping) {
      if (editorRef.current.innerHTML !== (pageData?.rawText || '')) {
        editorRef.current.innerHTML = pageData?.rawText || '';
      }
    }
  }, [pageData?.rawText, isTyping, currentPageNum]);

  async function loadPage(num: number) {
    if (!pdfRef.current) return;
    
    if (pageData) {
      await saveCurrentPage();
    }

    setCurrentPageNum(num);
    const data = await getPage(id, num);
    setPageData(data);
    setPasteDetected((data?.pasteEvents || 0) > 0);
    setChecklist({
      allLines: false,
      lineBreaks: false,
      symbols: false,
      noMissing: false,
      englishUnchanged: false
    });
    startTimeRef.current = Date.now();
    
    renderPdfPage(num, true); // fitWidth on page load
    setShowPageMap(false);
  }

  async function renderPdfPage(num: number, fitWidth = false) {
    if (!pdfRef.current || !canvasRef.current) return;
    
    try {
      const page = await pdfRef.current.getPage(num);
      
      // Calculate fit-to-width scale
      if (fitWidth && viewerRef.current) {
        const containerWidth = viewerRef.current.clientWidth - 64; // minus padding
        const defaultViewport = page.getViewport({ scale: 1.0 });
        baseScaleRef.current = containerWidth / defaultViewport.width;
      }
      
      const actualScale = baseScaleRef.current * zoom;
      const viewport = page.getViewport({ scale: actualScale });
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      
      const renderContext = {
        canvasContext: context,
        viewport: viewport
      };
      
      await page.render(renderContext).promise;
    } catch (error) {
      console.error('Error rendering page:', error);
    }
  }

  useEffect(() => {
    if (pdfRef.current && !isLoading) {
      renderPdfPage(currentPageNum);
    }
  }, [zoom]);

  const saveCurrentPage = async () => {
    if (!pageData) return;
    
    const timeSpent = (Date.now() - startTimeRef.current) / 1000;
    const updatedPage = {
      ...pageData,
      timeSpent: (pageData.timeSpent || 0) + timeSpent,
      lastModified: Date.now()
    };
    
    await updatePage(updatedPage);
    
    // Update local pages list
    setAllPages(prev => prev.map(p => p.pageNumber === currentPageNum ? updatedPage : p));
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setPageData({ ...pageData, rawText: e.target.value });
  };

  // Scroll wheel zoom on PDF viewer (Ctrl + scroll)
  // Must use native listener with passive:false to prevent browser zoom
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        e.stopPropagation();
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        setZoom(z => Math.min(3, Math.max(0.3, z + delta)));
      }
    };

    viewer.addEventListener('wheel', handleWheel, { passive: false });
    return () => viewer.removeEventListener('wheel', handleWheel);
  });

  const handlePaste = () => {
    setPasteDetected(true);
    setPageData((prev: any) => ({ ...prev, pasteEvents: (prev.pasteEvents || 0) + 1 }));
  };

  // Extract rich HTML from PDF page preserving font size, boldness, and indentation
  async function extractHtmlFromPage(pageNum: number): Promise<string> {
    if (!pdfRef.current) return '';
    const page = await pdfRef.current.getPage(pageNum);
    const textContent = await page.getTextContent();
    
    let minX = Infinity;
    for (const item of textContent.items) {
      if ('str' in item && item.str.trim().length > 0) {
        minX = Math.min(minX, item.transform[4]);
      }
    }
    if (minX === Infinity) minX = 0;

    let lastY: number | null = null;
    let html = '';
    let currentLine = '';
    let currentLineX = 0;
    
    for (const item of textContent.items) {
      if ('str' in item) {
        const x = Math.round(item.transform[4]);
        const y = Math.round(item.transform[5]);
        const size = Math.round(Math.sqrt(item.transform[0]*item.transform[0] + item.transform[1]*item.transform[1])) || 12;
        const isBold = item.fontName.toLowerCase().includes('bold') || item.fontName.toLowerCase().includes('black');
        
        const style = `font-size: ${size}px; font-weight: ${isBold ? 'bold' : 'normal'};`;
        
        if (lastY !== null && Math.abs(y - lastY) > 5) {
          const indent = Math.max(0, currentLineX - minX);
          html += `<div style="margin-left: ${Math.round(indent)}px;">${currentLine}</div>`;
          currentLine = '';
          currentLineX = x;
        } else {
          if (currentLine === '') currentLineX = x;
          if (lastY !== null && currentLine.length > 0 && !item.str.startsWith(' ')) {
            currentLine += ' ';
          }
        }
        currentLine += `<span style="${style}">${item.str}</span>`;
        lastY = y;
      }
    }
    if (currentLine) {
        const indent = Math.max(0, currentLineX - minX);
        html += `<div style="margin-left: ${Math.round(indent)}px;">${currentLine}</div>`;
    }
    
    return html;
  }

  // Simulate fast typing animation
  async function startAutoType() {
    if (isTyping) {
      typingRef.current = false;
      setIsTyping(false);
      return;
    }

    typingRef.current = true;
    setIsTyping(true);
    
    await autoTypePage(currentPageNum);
  }

  async function autoTypePage(pageNum: number) {
    if (!typingRef.current) return;

    // Extract rich html for this specific page
    const fullHtml = await extractHtmlFromPage(pageNum);
    if (!fullHtml) {
      alert(`No text found on page ${pageNum}. The page may be a scanned image.`);
      typingRef.current = false;
      setIsTyping(false);
      return;
    }

    // Load page data fresh from DB
    const freshPageData = await getPage(id, pageNum);
    setCurrentPageNum(pageNum);
    setPageData(freshPageData);
    setTypingProgress(0);

    // Render the PDF page
    renderPdfPage(pageNum, true);

    const editor = editorRef.current as any;
    if (editor) {
      editor.innerHTML = '';
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = fullHtml;
      
      const totalChars = tempDiv.textContent?.length || 1;
      let typedChars = 0;

      const lines = Array.from(tempDiv.childNodes);
      const totalLines = lines.length || 1;
      let typedLines = 0;

      for (const lineNode of lines) {
        if (!typingRef.current) break;
        
        const targetLine = lineNode.cloneNode(true) as HTMLElement;
        editor.appendChild(targetLine);
        
        typedLines++;
        setTypingProgress(Math.round((typedLines / totalLines) * 100));
        
        if (editor) editor.scrollTop = editor.scrollHeight;
        
        // Fast line-by-line injection
        await new Promise(r => setTimeout(r, 2));
      }
      
      if (typingRef.current) {
         setPageData((prev: any) => ({ ...prev, rawText: editor.innerHTML }));
      }
    }

    // Save completed page
    const completedPage = {
      ...(freshPageData || {}),
      id: `${id}_${pageNum}`,
      documentId: id,
      pageNumber: pageNum,
      rawText: editor ? editor.innerHTML : '',
      isCompleted: true,
      completedAt: Date.now(),
      timeSpent: (freshPageData?.timeSpent || 0),
      pasteEvents: freshPageData?.pasteEvents || 0,
      lastModified: Date.now()
    };
    await updatePage(completedPage);
    setPageData(completedPage);
    setAllPages(prev => prev.map(p => p.pageNumber === pageNum ? completedPage : p));

    // Auto-advance to next page
    const nextPage = pageNum + 1;
    if (typingRef.current && nextPage <= doc.totalPages) {
      await new Promise(r => setTimeout(r, 500));
      if (typingRef.current) {
        await autoTypePage(nextPage);
      }
    } else {
      typingRef.current = false;
      setIsTyping(false);
      setTypingProgress(100);
      // All pages done — show completion screen
      setShowComplete(true);
    }
  }

  const isChecklistComplete = Object.values(checklist).every(v => v);

  const confirmPageComplete = async () => {
    if (!isChecklistComplete) return;
    
    const updatedPage = {
      ...pageData,
      isCompleted: true,
      completedAt: Date.now()
    };
    
    await updatePage(updatedPage);
    setPageData(updatedPage);
    setAllPages(prev => prev.map(p => p.pageNumber === currentPageNum ? updatedPage : p));
    setShowChecklist(false);
    
    if (currentPageNum < doc.totalPages) {
      loadPage(currentPageNum + 1);
    }
  };

  const exportToDocx = async () => {
    const { Document, Packer, Paragraph, TextRun, PageBreak } = await import('docx');

    // Refresh pages from DB to get latest text
    const freshPages = await getPagesForDocument(id);
    const sortedPages = freshPages.sort((a, b) => a.pageNumber - b.pageNumber);
    
    const sections = sortedPages.map((p, pageIndex) => {
      const div = document.createElement('div');
      div.innerHTML = p.rawText || '';
      
      const paragraphs: any[] = [];
      
      if (div.children.length === 0 && div.textContent) {
         const lines = (p.rawText || '').split('\n');
         lines.forEach(line => {
           if (line.trim().length > 0) {
             paragraphs.push(new Paragraph({
               children: [new TextRun({ text: line, font: 'Krishna Wide Regular', size: 24 })]
             }));
           }
         });
      } else {
        Array.from(div.children).forEach(lineNode => {
          const elLine = lineNode as HTMLElement;
          const styleAttrLine = elLine.getAttribute('style') || '';
          const marginLeftMatch = styleAttrLine.match(/margin-left:\s*(\d+)px/);
          const indentPixels = marginLeftMatch ? parseInt(marginLeftMatch[1]) : 0;
          // Twips conversion (1px ~ 20 twips, strict standard)
          const leftIndent = indentPixels * 20;

          const runs: any[] = [];
          Array.from(lineNode.childNodes).forEach(node => {
            if (node.nodeType === Node.TEXT_NODE) {
               if (node.textContent?.trim()) {
                 runs.push(new TextRun({ text: node.textContent, font: 'Krishna Wide Regular', size: 24 }));
               }
            } else if (node.nodeType === Node.ELEMENT_NODE) {
               const el = node as HTMLElement;
               const styleAttrSpan = el.getAttribute('style') || '';
               const fontSizeMatch = styleAttrSpan.match(/font-size:\s*(\d+)px/);
               const size = fontSizeMatch ? parseInt(fontSizeMatch[1]) * 2 : 24; // docx uses half-points
               const bold = styleAttrSpan.includes('bold') || styleAttrSpan.includes('700');
               runs.push(new TextRun({ 
                 text: el.textContent || '', 
                 font: 'Krishna Wide Regular', 
                 size, 
                 bold 
               }));
            }
          });
          
          if (runs.length > 0) {
             paragraphs.push(new Paragraph({ 
               children: runs,
               indent: { left: leftIndent }
             }));
          } else {
             paragraphs.push(new Paragraph({ children: [new TextRun({ text: "" })] }));
          }
        });
      }

      return {
        properties: pageIndex > 0 ? { page: { } } : {},
        children: paragraphs
      };
    });

    const docx = new Document({ sections });

    try {
      const blob = await Packer.toBlob(docx);
      
      // Re-wrap the blob to guarantee the correct MIME type
      const safeBlob = new Blob([blob], { 
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' 
      });
      
      const fileName = (doc?.fileName || 'transcription').replace('.pdf', '').replace(/[^a-zA-Z0-9\s\-_]/g, '') + '_transcription.docx';
      
      const url = window.URL.createObjectURL(safeBlob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = fileName;
      
      document.body.appendChild(a);
      a.click();
      
      // Cleanup with a small delay to ensure download starts
      setTimeout(() => {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }, 150);
    } catch (err) {
      console.error('Export failed:', err);
      alert('Export failed. Check console for details.');
    }
  };

  if (isLoading) {
    return <div className="h-screen bg-neutral-950 flex items-center justify-center text-white">Loading Workspace...</div>;
  }

  return (
    <div className="h-screen flex flex-col bg-neutral-950 text-neutral-200 overflow-hidden font-sans">
      {/* Header */}
      <header className="h-14 border-b border-neutral-800 flex items-center justify-between px-4 bg-neutral-900 shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={() => router.push('/')} className="p-2 hover:bg-neutral-800 rounded-lg transition-colors text-neutral-400 hover:text-white"><Home size={18} /></button>
          <div className="h-6 w-px bg-neutral-700" />
          <h1 className="font-semibold truncate max-w-[200px] text-sm text-neutral-100">{doc?.fileName}</h1>
          <button 
            onClick={() => setShowPageMap(true)}
            className="flex items-center gap-1.5 px-2 py-1 bg-neutral-800 hover:bg-neutral-700 rounded text-xs font-medium transition-colors"
          >
            <LayoutGrid size={14} />
            Page {currentPageNum} / {doc?.totalPages}
          </button>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex bg-neutral-800 rounded-lg p-0.5">
            <button onClick={() => setZoom(z => Math.max(0.5, z - 0.1))} className="p-1.5 hover:bg-neutral-700 rounded transition-colors"><ZoomOut size={16} /></button>
            <div className="px-2 flex items-center text-[10px] font-mono w-10 justify-center">{Math.round(zoom * 100)}%</div>
            <button onClick={() => setZoom(z => Math.min(3, z + 0.1))} className="p-1.5 hover:bg-neutral-700 rounded transition-colors"><ZoomIn size={16} /></button>
          </div>
          <div className="h-6 w-px bg-neutral-700" />
          <button 
            onClick={startAutoType}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              isTyping 
                ? 'bg-red-600 hover:bg-red-700 text-white' 
                : 'bg-emerald-600 hover:bg-emerald-700 text-white'
            }`}
          >
            {isTyping ? <><Square size={14} /> Stop</> : <><Play size={14} /> Auto Type</>}
          </button>
          <button onClick={exportToDocx} className="flex items-center gap-2 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 rounded-lg text-xs font-medium transition-colors"><Download size={16} /> Export</button>
          <button onClick={() => setShowChecklist(true)} className="flex items-center gap-2 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-colors"><CheckCircle2 size={16} /> Complete</button>
        </div>
      </header>

      {/* Main Workspace */}
      <main className="flex-1 flex overflow-hidden">
        {/* Left: Viewer */}
        <div ref={viewerRef} className="flex-1 overflow-auto bg-neutral-800 flex justify-center p-8 relative">
          <div className="relative shadow-[0_0_50px_rgba(0,0,0,0.5)] bg-white h-fit">
             <canvas ref={canvasRef} className="max-w-none" />
          </div>
        </div>

        {/* Resizer */}
        <div className="w-1 bg-neutral-800" />

        {/* Right: Editor */}
        <div className="w-[450px] xl:w-[550px] flex flex-col bg-neutral-900 border-l border-neutral-800">
          {!fontLoaded && (
            <div className="bg-red-500/10 border-b border-red-500/20 p-2 flex items-center gap-2 text-[10px] text-red-500 font-bold uppercase">
                <AlertCircle size={14} />
                KrishnaWide Font not detected. Rendering may be incorrect.
            </div>
          )}
          <div className="p-3 border-b border-neutral-800 flex justify-between items-center text-[10px] text-neutral-500 uppercase tracking-widest font-black">
            <span className="flex items-center gap-2">
              Editor
              {isTyping && (
                <span className="flex items-center gap-1 text-emerald-500 normal-case tracking-normal">
                  <Loader2 size={10} className="animate-spin" />
                  Typing... {typingProgress}%
                </span>
              )}
            </span>
            <div className="flex gap-4">
              <span>L: {pageData?.rawText?.includes('<div') ? (pageData.rawText.match(/<div/g) || []).length : (pageData?.rawText?.split('\n').filter((l: string) => l.length > 0).length || 0)}</span>
              <span>C: {pageData?.rawText?.replace(/<[^>]*>?/gm, '').length || 0}</span>
            </div>
          </div>
          <div className="flex-1 relative">
            {pasteDetected && (
              <div className="absolute top-4 right-4 z-10 flex items-center gap-1.5 px-2 py-1 bg-amber-500 text-neutral-950 rounded text-[9px] font-black uppercase tracking-tighter">
                <AlertCircle size={10} /> Paste Detected
              </div>
            )}
            <div
              ref={editorRef as any}
              contentEditable
              onInput={(e) => {
                if (!isTyping) {
                  setPageData((prev: any) => ({ ...prev, rawText: e.currentTarget.innerHTML }));
                }
              }}
              onPaste={handlePaste}
              spellCheck={false}
              className="w-full h-full p-8 bg-transparent outline-none overflow-auto leading-relaxed whitespace-pre-wrap"
              style={{ fontFamily: 'KrishnaWide, serif' }}
              // Intentionally omitting dangerouslySetInnerHTML to prevent React from wiping DOM during auto-type
            />
          </div>
        </div>
      </main>

      {/* Page Navigation */}
      <footer className="h-10 border-t border-neutral-800 flex items-center justify-between px-4 bg-neutral-900 shrink-0">
        <div className="flex items-center gap-4 text-[10px] text-neutral-500 font-medium">
          <span className="flex items-center gap-1"><Clock size={12} /> SESSION: {Math.floor((Date.now() - startTimeRef.current)/1000)}s</span>
        </div>

        <div className="flex items-center gap-1">
          <button disabled={currentPageNum === 1} onClick={() => loadPage(currentPageNum - 1)} className="p-1 hover:bg-neutral-800 rounded disabled:opacity-20 transition-colors"><ChevronLeft size={18} /></button>
          <div className="px-3 text-xs font-bold text-neutral-400">PAGE {currentPageNum}</div>
          <button disabled={currentPageNum === doc?.totalPages} onClick={() => loadPage(currentPageNum + 1)} className="p-1 hover:bg-neutral-800 rounded disabled:opacity-20 transition-colors"><ChevronRight size={18} /></button>
        </div>

        <div className="flex items-center gap-2">
            <button onClick={() => setShowKeyboardRef(true)} className="p-1 text-neutral-500 hover:text-white transition-colors"><HelpCircle size={16} /></button>
            <button className="p-1 text-neutral-500 hover:text-white transition-colors"><Settings size={16} /></button>
        </div>
      </footer>

      {/* Keyboard Reference Overlay */}
      {showKeyboardRef && <KeyboardReference onClose={() => setShowKeyboardRef(false)} />}

      {/* Page Map Overlay */}
      {showPageMap && (
          <div className="fixed inset-0 z-[60] bg-neutral-950/90 backdrop-blur-md p-12 overflow-auto">
              <div className="max-w-4xl mx-auto">
                  <div className="flex justify-between items-center mb-8">
                      <h2 className="text-2xl font-black tracking-tighter uppercase">Document Map</h2>
                      <button onClick={() => setShowPageMap(false)} className="px-4 py-2 bg-neutral-800 rounded-lg hover:bg-neutral-700 transition-colors">Close</button>
                  </div>
                  <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 gap-3">
                      {allPages.map(p => (
                          <button 
                            key={p.pageNumber}
                            onClick={() => loadPage(p.pageNumber)}
                            className={`aspect-square rounded-lg flex flex-col items-center justify-center gap-1 transition-all ${p.pageNumber === currentPageNum ? 'bg-blue-600 scale-110 shadow-xl z-10' : p.isCompleted ? 'bg-neutral-800 text-green-500' : 'bg-neutral-900 border border-neutral-800 text-neutral-500 hover:border-neutral-600'}`}
                          >
                              <span className="text-xs font-bold">{p.pageNumber}</span>
                              {p.isCompleted && <CheckCircle2 size={10} />}
                          </button>
                      ))}
                  </div>
              </div>
          </div>
      )}

      {/* Checklist Modal */}
      {showChecklist && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-neutral-800 bg-neutral-900/50">
              <h2 className="text-lg font-black uppercase tracking-tighter flex items-center gap-2">
                <CheckCircle2 className="text-blue-500" /> Page {currentPageNum} Verification
              </h2>
            </div>
            <div className="p-6 space-y-3">
              {[
                { id: 'allLines', label: 'All lines typed' },
                { id: 'lineBreaks', label: 'Line breaks match' },
                { id: 'symbols', label: 'Symbols preserved' },
                { id: 'noMissing', label: 'No missing characters' },
                { id: 'englishUnchanged', label: 'English words identical' }
              ].map((item) => (
                <label key={item.id} className="flex items-center gap-3 p-3 bg-neutral-800/50 hover:bg-neutral-800 rounded-xl cursor-pointer transition-all active:scale-95 group">
                  <input type="checkbox" checked={checklist[item.id as keyof typeof checklist]} onChange={() => setChecklist(prev => ({ ...prev, [item.id]: !prev[item.id] }))} className="w-5 h-5 rounded-full border-neutral-700 bg-neutral-900 text-blue-600 focus:ring-offset-0" />
                  <span className="text-xs font-bold uppercase tracking-tight text-neutral-400 group-hover:text-white">{item.label}</span>
                </label>
              ))}
            </div>
            <div className="p-4 bg-neutral-950 border-t border-neutral-800 flex gap-2">
              <button onClick={() => setShowChecklist(false)} className="flex-1 py-3 rounded-xl bg-neutral-900 hover:bg-neutral-800 font-bold text-[10px] uppercase tracking-widest transition-colors">Cancel</button>
              <button disabled={!isChecklistComplete} onClick={confirmPageComplete} className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-20 font-bold text-[10px] uppercase tracking-widest text-white transition-colors">Confirm Completion</button>
            </div>
          </div>
        </div>
      )}
      {/* Completion & Export Modal */}
      {showComplete && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/90 backdrop-blur-md p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="p-8 text-center border-b border-neutral-800">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500/10 mb-4">
                <CheckCircle2 size={32} className="text-emerald-500" />
              </div>
              <h2 className="text-2xl font-black uppercase tracking-tight text-white">Transcription Complete</h2>
              <p className="text-neutral-400 text-sm mt-2">All {doc?.totalPages} pages have been processed and verified.</p>
            </div>

            <div className="p-6 space-y-3 max-h-60 overflow-auto">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-neutral-500 mb-3">Verification Summary</h3>
              {allPages.sort((a, b) => a.pageNumber - b.pageNumber).map(p => {
                const plainText = p.rawText ? p.rawText.replace(/<[^>]*>?/gm, '') : '';
                const lines = p.rawText?.includes('<div') ? (p.rawText.match(/<div/g) || []).length : (p.rawText ? p.rawText.split('\n').filter((l: string) => l.length > 0).length : 0);
                const chars = plainText.length;
                return (
                  <div key={p.pageNumber} className="flex items-center justify-between p-3 bg-neutral-800/50 rounded-xl">
                    <div className="flex items-center gap-3">
                      <CheckCircle2 size={16} className={p.isCompleted ? 'text-emerald-500' : 'text-neutral-600'} />
                      <span className="text-sm font-bold text-white">Page {p.pageNumber}</span>
                    </div>
                    <div className="flex items-center gap-4 text-[10px] text-neutral-400 font-medium">
                      <span>{lines} lines</span>
                      <span>{chars.toLocaleString()} chars</span>
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${p.isCompleted ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'}`}>
                        {p.isCompleted ? 'Verified' : 'Pending'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="p-6 bg-neutral-950 border-t border-neutral-800 space-y-3">
              <button 
                onClick={() => { exportToDocx(); setShowComplete(false); }}
                className="w-full py-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm uppercase tracking-wider transition-colors flex items-center justify-center gap-2"
              >
                <Download size={18} />
                Export as .DOCX
              </button>
              <button 
                onClick={() => setShowComplete(false)}
                className="w-full py-3 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-neutral-400 font-bold text-[10px] uppercase tracking-widest transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
