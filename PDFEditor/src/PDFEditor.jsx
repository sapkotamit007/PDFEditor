import React, { useState, useRef, useEffect } from 'react';
import { 
  Upload, FileText, Download, Trash2, RotateCw, MoveUp, MoveDown, 
  Type, Pen, MousePointer, X, Save, Eraser, Check, Image as ImageIcon, 
  Loader2, ChevronLeft, ChevronRight, Ban, LayoutTemplate, Copy,
  Bold, Italic, Underline as UnderlineIcon, GripVertical, Palette
} from 'lucide-react';

export default function PDFEditor() {
  // --- STATE ---
  const [isLibrariesLoaded, setIsLibrariesLoaded] = useState(false);
  const [pdfFile, setPdfFile] = useState(null); 
  const [pages, setPages] = useState([]); 
  const [activePageIndex, setActivePageIndex] = useState(0);
  const [scale, setScale] = useState(1.0); 
  const [tool, setTool] = useState('cursor'); // cursor, text, whiteout, draw
  const [annotations, setAnnotations] = useState({}); 
  const [selectedAnnotationIndex, setSelectedAnnotationIndex] = useState(null); 
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  
  // Text Formatting State
  const [textFormatting, setTextFormatting] = useState({
    fontFamily: 'Helvetica', 
    fontSize: 16,
    isBold: false,
    isItalic: false,
    isUnderline: false,
    color: '#000000'
  });

  // Interaction State
  const [dragging, setDragging] = useState(null); 
  const [isDrawing, setIsDrawing] = useState(false);
  
  // Drawing Refs (for smooth drawing)
  const lastPos = useRef({ x: 0, y: 0 });
  const whiteoutColorRef = useRef('white');

  // Editing State
  const [inputBox, setInputBox] = useState(null); 
  const [editingIndex, setEditingIndex] = useState(null); 

  const pdfCanvasRef = useRef(null); 
  const drawCanvasRef = useRef(null); 
  const containerRef = useRef(null);
  const renderTaskRef = useRef(null); 

  // --- DYNAMIC LIBRARY LOADING ---
  useEffect(() => {
    const loadScript = (src) => {
      return new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
    };

    const link = document.createElement('link');
    link.href = 'https://fonts.googleapis.com/css2?family=Dancing+Script:wght@400;700&display=swap';
    link.rel = 'stylesheet';
    document.head.appendChild(link);

    Promise.all([
      loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'),
      loadScript('https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js')
    ]).then(() => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      setIsLibrariesLoaded(true);
    }).catch(err => {
      console.error("Failed to load PDF libraries:", err);
      alert("Failed to load essential PDF libraries.");
    });
  }, []);
  
  // --- UPLOAD & LOAD ---
  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    setIsProcessing(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = window.pdfjsLib.getDocument(arrayBuffer.slice(0));
      const pdf = await loadingTask.promise;
      
      const newPages = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 0.3 });
        
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        
        await page.render({ canvasContext: context, viewport }).promise;
        
        newPages.push({
          id: i,
          dataUrl: canvas.toDataURL(),
          rotation: 0,
        });
      }
      
      setPdfFile(arrayBuffer);
      setPages(newPages);
      setAnnotations({});
      setActivePageIndex(0);
    } catch (error) {
      console.error("Error loading PDF:", error);
      alert("Could not load PDF.");
    } finally {
      setIsProcessing(false);
    }
  };

  // --- RENDER PIPELINE (PDF LAYER) ---
  useEffect(() => {
    if (!pdfFile || pages.length === 0 || !isLibrariesLoaded) return;
    let isCancelled = false;

    const renderPdf = async () => {
      const pdfCanvas = pdfCanvasRef.current;
      const drawCanvas = drawCanvasRef.current;
      if (!pdfCanvas || !drawCanvas) return;
      
      try {
        const loadingTask = window.pdfjsLib.getDocument(pdfFile.slice(0));
        const pdf = await loadingTask.promise;
        if (isCancelled) return;

        const pageData = pages[activePageIndex];
        const page = await pdf.getPage(pageData.id);
        if (isCancelled) return;
        
        const viewport = page.getViewport({ 
          scale: scale * 1.5, 
          rotation: pageData.rotation 
        });
        
        pdfCanvas.width = viewport.width;
        pdfCanvas.height = viewport.height;
        drawCanvas.width = viewport.width;
        drawCanvas.height = viewport.height;
        
        if (renderTaskRef.current) {
            try { await renderTaskRef.current.cancel(); } catch (e) {}
        }

        const pdfContext = pdfCanvas.getContext('2d');
        const task = page.render({ canvasContext: pdfContext, viewport });
        renderTaskRef.current = task;
        await task.promise;
        
      } catch (err) {
        if (err.name !== 'RenderingCancelledException') console.error("Render error:", err);
      }
    };
    
    renderPdf();
    return () => {
        isCancelled = true;
        if (renderTaskRef.current) try { renderTaskRef.current.cancel(); } catch(e) {}
    };
  }, [activePageIndex, pages, pdfFile, isLibrariesLoaded, scale]); 

  // --- RENDER PIPELINE (DRAWING LAYER) ---
  useEffect(() => {
      const drawCanvas = drawCanvasRef.current;
      if (!drawCanvas) return;

      const renderDrawings = async () => {
          const drawContext = drawCanvas.getContext('2d');
          drawContext.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
          
          const pageAnnos = annotations[activePageIndex] || [];
          const drawLayer = pageAnnos.find(a => a.type === 'drawing_layer');
          
          if (drawLayer) {
             const img = new Image();
             img.src = drawLayer.dataUrl;
             await new Promise(r => { img.onload = r; }); 
             drawContext.drawImage(img, 0, 0);
          }
      };

      renderDrawings();
  }, [activePageIndex, annotations, scale]);


  // --- INTERACTION HANDLERS ---
  const getCoords = (e) => {
    const rect = drawCanvasRef.current.getBoundingClientRect();
    let clientX, clientY;

    if (e.touches && e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
    } else {
        clientX = e.clientX;
        clientY = e.clientY;
    }
    
    return {
      x: (clientX - rect.left) * (drawCanvasRef.current.width / rect.width),
      y: (clientY - rect.top) * (drawCanvasRef.current.height / rect.height),
      relX: (clientX - rect.left) / rect.width,
      relY: (clientY - rect.top) / rect.height,
      clientX: clientX - rect.left,
      clientY: clientY - rect.top
    };
  };

  const handleCanvasLayerDown = (e) => {
      if (tool === 'cursor') {
          if (inputBox) {
              handleInputConfirm(inputBox.text);
          } else {
              setSelectedAnnotationIndex(null);
          }
          return;
      }

      if (tool === 'text') {
          e.preventDefault(); 
          const { relX, relY, clientX, clientY } = getCoords(e);
          setInputBox({
              x: clientX,
              y: clientY,
              relX,
              relY,
              text: '',
              style: { ...textFormatting } 
          });
          setEditingIndex(null); 
          return;
      }

      if (tool === 'draw' || tool === 'whiteout') {
          e.preventDefault();
          setIsDrawing(true);
          setSelectedAnnotationIndex(null); 
          const { x, y } = getCoords(e);
          
          lastPos.current = { x, y };
          
          const ctx = drawCanvasRef.current.getContext('2d');
          let strokeColor = '#ef4444'; 
          let lineWidth = 3 * scale;

          if (tool === 'whiteout') {
            // --- SMART WHITEOUT LOGIC ---
            try {
                const pdfCtx = pdfCanvasRef.current.getContext('2d');
                // Sample a 9x9 area around click to find the background paper color
                // This avoids picking up the black text pixel exactly under the mouse
                const radius = 4; 
                const startX = Math.max(0, Math.floor(x) - radius);
                const startY = Math.max(0, Math.floor(y) - radius);
                const w = Math.min(pdfCanvasRef.current.width - startX, radius * 2 + 1);
                const h = Math.min(pdfCanvasRef.current.height - startY, radius * 2 + 1);
                
                const imgData = pdfCtx.getImageData(startX, startY, w, h);
                const data = imgData.data;
                
                let maxLuma = -1;
                let bestColor = 'white';

                for (let i = 0; i < data.length; i += 4) {
                    const r = data[i];
                    const g = data[i+1];
                    const b = data[i+2];
                    const a = data[i+3];
                    
                    // Ignore transparent or text-like dark pixels
                    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
                    
                    // We look for the BRIGHTEST pixel in the area (likely the paper)
                    if (a > 50 && luma > maxLuma) {
                        maxLuma = luma;
                        bestColor = `rgb(${r}, ${g}, ${b})`;
                    }
                }
                
                // Fallback: If area is generally dark or empty, default to white
                if (maxLuma < 100) { 
                    strokeColor = 'white';
                } else {
                    strokeColor = bestColor;
                }

            } catch (err) {
                strokeColor = 'white';
            }
            whiteoutColorRef.current = strokeColor;
            lineWidth = 20 * scale; 
          } else {
            whiteoutColorRef.current = '#ef4444';
          }

          // Draw Initial Dot
          ctx.beginPath();
          ctx.arc(x, y, lineWidth / 2, 0, Math.PI * 2);
          ctx.fillStyle = whiteoutColorRef.current;
          ctx.fill();
          
          // Setup for dragging path
          ctx.strokeStyle = whiteoutColorRef.current;
          ctx.lineWidth = lineWidth;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.beginPath();
          ctx.moveTo(x, y);
      }
  };

  const draw = (e) => {
    if (!isDrawing) return;
    const { x, y } = getCoords(e);
    const ctx = drawCanvasRef.current.getContext('2d');
    
    // Ensure consistent color during drag
    ctx.strokeStyle = whiteoutColorRef.current;
    
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(x, y);
    ctx.stroke();
    
    lastPos.current = { x, y };
  };

  const handleInputConfirm = (text) => {
      if (text !== undefined && text.trim() !== "" && inputBox) {
          setAnnotations(prev => {
              const pageAnnos = [...(prev[activePageIndex] || [])];
              const newAnno = { 
                  type: 'text', 
                  content: text, 
                  x: inputBox.relX, 
                  y: inputBox.relY,
                  style: inputBox.style 
              };

              if (editingIndex !== null) {
                  pageAnnos[editingIndex] = newAnno;
              } else {
                  pageAnnos.push(newAnno);
              }
              return { ...prev, [activePageIndex]: pageAnnos };
          });
          
          if (editingIndex === null) {
             const currentLength = (annotations[activePageIndex] || []).length;
             setSelectedAnnotationIndex(currentLength);
          } else {
             setSelectedAnnotationIndex(editingIndex);
          }
          setTool('cursor');
      } else if (editingIndex !== null && (!text || text.trim() === "")) {
          setAnnotations(prev => {
              const pageAnnos = [...(prev[activePageIndex] || [])];
              pageAnnos.splice(editingIndex, 1);
              return { ...prev, [activePageIndex]: pageAnnos };
          });
      }
      
      setInputBox(null);
      setEditingIndex(null);
  };

  const handleAnnotationMouseDown = (e, index) => {
      if (tool !== 'cursor') return;
      e.stopPropagation(); 
      e.preventDefault();
      
      setSelectedAnnotationIndex(index);
      
      const anno = annotations[activePageIndex][index];
      if (anno.type === 'text' && anno.style) {
          setTextFormatting(anno.style);
      }

      const rect = containerRef.current.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;

      setDragging({
          type: 'annotation',
          index,
          startX: clientX,
          startY: clientY,
          initialAnnoX: anno.x,
          initialAnnoY: anno.y,
          rect
      });
  };

  const handleInputBoxDragStart = (e) => {
      e.stopPropagation();
      e.preventDefault();
      const rect = containerRef.current.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;

      setDragging({
          type: 'input',
          startX: clientX,
          startY: clientY,
          initialX: inputBox.x,
          initialY: inputBox.y,
          rect
      });
  };

  const handleAnnotationDoubleClick = (e, index) => {
      if (tool !== 'cursor') return;
      e.stopPropagation();
      
      const anno = annotations[activePageIndex][index];
      if (anno.type !== 'text') return;

      const rect = containerRef.current.getBoundingClientRect();
      const clientX = anno.x * rect.width;
      const clientY = anno.y * rect.height;

      setEditingIndex(index);
      setInputBox({
          x: clientX,
          y: clientY,
          relX: anno.x,
          relY: anno.y,
          text: anno.content,
          style: anno.style || textFormatting
      });
  };

  const handleGlobalMouseMove = (e) => {
      if (isDrawing) { draw(e); return; }
      
      if (dragging) {
          e.preventDefault();
          const clientX = e.touches ? e.touches[0].clientX : e.clientX;
          const clientY = e.touches ? e.touches[0].clientY : e.clientY;
          const deltaXPixels = clientX - dragging.startX;
          const deltaYPixels = clientY - dragging.startY;

          if (dragging.type === 'input') {
              const newX = dragging.initialX + deltaXPixels;
              const newY = dragging.initialY + deltaYPixels;
              
              setInputBox(prev => ({
                  ...prev,
                  x: newX,
                  y: newY,
                  relX: newX / dragging.rect.width,
                  relY: newY / dragging.rect.height
              }));

          } else if (dragging.type === 'annotation') {
              const deltaXPercent = deltaXPixels / dragging.rect.width;
              const deltaYPercent = deltaYPixels / dragging.rect.height;
              
              const newX = dragging.initialAnnoX + deltaXPercent;
              const newY = dragging.initialAnnoY + deltaYPercent;
              
              setAnnotations(prev => {
                  const currentMsg = [...(prev[activePageIndex] || [])];
                  if (!currentMsg[dragging.index]) return prev;
                  currentMsg[dragging.index] = { ...currentMsg[dragging.index], x: newX, y: newY };
                  return { ...prev, [activePageIndex]: currentMsg };
              });
          }
      }
  };

  const handleGlobalMouseUp = () => {
      if (isDrawing) stopDrawing();
      if (dragging) setDragging(null);
  };
  
  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    const newDataUrl = drawCanvasRef.current.toDataURL();
    setAnnotations(prev => {
      const pageAnnos = prev[activePageIndex] || [];
      const otherAnnos = pageAnnos.filter(a => a.type !== 'drawing_layer');
      return {
        ...prev,
        [activePageIndex]: [...otherAnnos, { type: 'drawing_layer', dataUrl: newDataUrl }]
      };
    });
  };

  const deleteAnnotation = (e, idx) => {
      e.stopPropagation(); 
      if (!confirm("Delete this item?")) return;
      setAnnotations(prev => {
          const current = [...(prev[activePageIndex] || [])];
          current.splice(idx, 1);
          return { ...prev, [activePageIndex]: current };
      });
      setSelectedAnnotationIndex(null);
  };

  const deleteInputBox = () => {
      setInputBox(null);
      setEditingIndex(null);
  };
  
  const updateFormatting = (key, value) => {
      const newStyle = { ...textFormatting, [key]: value };
      setTextFormatting(newStyle);
      
      if (inputBox) {
          setInputBox(prev => ({ ...prev, style: newStyle }));
      }
      
      if (selectedAnnotationIndex !== null) {
          setAnnotations(prev => {
              const pageAnnos = [...(prev[activePageIndex] || [])];
              const anno = pageAnnos[selectedAnnotationIndex];
              if (anno && anno.type === 'text') {
                  pageAnnos[selectedAnnotationIndex] = { ...anno, style: { ...anno.style, [key]: value } };
                  return { ...prev, [activePageIndex]: pageAnnos };
              }
              return prev;
          });
      }
  };

  // --- FLOATING TOOLBAR COMPONENT ---
  const FloatingToolbar = ({ style, onUpdate, onDelete, onDragStart }) => {
      const colors = ['#000000', '#ef4444', '#3b82f6', '#22c55e', '#f59e0b']; 

      return (
        <div className="absolute z-50 bg-white shadow-xl rounded-lg p-1.5 flex items-center gap-2 border border-slate-200 -translate-y-full mt-[-10px]"
             style={{ 
                 top: (inputBox ? inputBox.y : (annotations[activePageIndex][selectedAnnotationIndex].y * containerRef.current.getBoundingClientRect().height)) - 10, 
                 left: (inputBox ? inputBox.x : (annotations[activePageIndex][selectedAnnotationIndex].x * containerRef.current.getBoundingClientRect().width)) 
             }}>
            
            {/* Drag Handle */}
            {inputBox && (
                <div 
                    className="cursor-grab hover:bg-slate-100 p-1 rounded text-slate-400"
                    onMouseDown={onDragStart}
                    onTouchStart={onDragStart}
                    title="Drag to move text"
                >
                    <GripVertical size={14} />
                </div>
            )}

            <select 
                className="h-7 text-xs bg-slate-50 border border-slate-200 rounded px-1 outline-none"
                value={style.fontFamily}
                onChange={(e) => onUpdate('fontFamily', e.target.value)}
                onMouseDown={(e) => e.stopPropagation()} 
            >
                <option value="Helvetica">Helvetica</option>
                <option value="Times">Times</option>
                <option value="Courier">Courier</option>
            </select>
            <input 
                type="number" 
                value={style.fontSize} 
                onChange={(e) => onUpdate('fontSize', Number(e.target.value))}
                onMouseDown={(e) => e.stopPropagation()}
                className="w-10 h-7 text-xs text-center border border-slate-200 rounded outline-none"
            />
            <div className="flex bg-slate-100 rounded">
                <button onClick={() => onUpdate('isBold', !style.isBold)} className={`p-1.5 hover:bg-slate-200 rounded ${style.isBold ? 'text-blue-600 font-bold' : ''}`}><Bold size={14}/></button>
                <button onClick={() => onUpdate('isItalic', !style.isItalic)} className={`p-1.5 hover:bg-slate-200 rounded ${style.isItalic ? 'text-blue-600' : ''}`}><Italic size={14}/></button>
                <button onClick={() => onUpdate('isUnderline', !style.isUnderline)} className={`p-1.5 hover:bg-slate-200 rounded ${style.isUnderline ? 'text-blue-600' : ''}`}><UnderlineIcon size={14}/></button>
            </div>
            
            <div className="w-px h-4 bg-slate-200 mx-1"></div>
            
            {/* Color Palette */}
            <div className="flex gap-1">
                {colors.map(c => (
                    <button 
                        key={c}
                        onClick={() => onUpdate('color', c)} 
                        className={`w-4 h-4 rounded-full border ${style.color === c ? 'border-slate-600 ring-1 ring-slate-300' : 'border-slate-200'}`} 
                        style={{backgroundColor: c}}
                    />
                ))}
            </div>

            {/* Delete Button */}
            {inputBox && (
                <>
                    <div className="w-px h-4 bg-slate-200 mx-1"></div>
                    <button 
                        onClick={onDelete} 
                        className="p-1.5 hover:bg-red-50 text-red-500 rounded transition-colors"
                        title="Delete text"
                    >
                        <Trash2 size={14} />
                    </button>
                </>
            )}
        </div>
      );
  };

  // --- SAVE ---
  const savePdf = async () => {
    if (!pdfFile || !window.PDFLib) return;
    setIsProcessing(true);
    try {
      const originalPdf = await window.PDFLib.PDFDocument.load(pdfFile);
      const newPdf = await window.PDFLib.PDFDocument.create();
      const { StandardFonts, rgb } = window.PDFLib;
      
      const fonts = {
          Helvetica: await newPdf.embedFont(StandardFonts.Helvetica),
          HelveticaBold: await newPdf.embedFont(StandardFonts.HelveticaBold),
          HelveticaOblique: await newPdf.embedFont(StandardFonts.HelveticaOblique),
          HelveticaBoldOblique: await newPdf.embedFont(StandardFonts.HelveticaBoldOblique),
          Times: await newPdf.embedFont(StandardFonts.TimesRoman),
          TimesBold: await newPdf.embedFont(StandardFonts.TimesRomanBold),
          TimesItalic: await newPdf.embedFont(StandardFonts.TimesRomanItalic),
          TimesBoldItalic: await newPdf.embedFont(StandardFonts.TimesRomanBoldItalic),
          Courier: await newPdf.embedFont(StandardFonts.Courier),
          CourierBold: await newPdf.embedFont(StandardFonts.CourierBold),
          CourierOblique: await newPdf.embedFont(StandardFonts.CourierOblique),
          CourierBoldOblique: await newPdf.embedFont(StandardFonts.CourierBoldOblique),
      };

      const getPdfFont = (family, bold, italic) => {
          let key = family;
          if (family === 'Times') key = 'Times';
          else if (family === 'Courier') key = 'Courier';
          else key = 'Helvetica';

          if (bold && italic) key += 'BoldItalic'; 
          else if (bold) key += 'Bold';
          else if (italic) key += (family === 'Helvetica' || family === 'Courier') ? 'Oblique' : 'Italic';
          
          return fonts[key] || fonts.Helvetica;
      };
      
      const hexToRgb = (hex) => {
          const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
          return result ? rgb(
              parseInt(result[1], 16) / 255,
              parseInt(result[2], 16) / 255,
              parseInt(result[3], 16) / 255
          ) : rgb(0, 0, 0);
      };

      for (let i = 0; i < pages.length; i++) {
        const pageMeta = pages[i];
        const [copiedPage] = await newPdf.copyPages(originalPdf, [pageMeta.id - 1]);
        copiedPage.setRotation(window.PDFLib.degrees(pageMeta.rotation));
        
        const pageAnnos = annotations[i] || [];
        const { width, height } = copiedPage.getSize();
        
        for (const anno of pageAnnos) {
          if (anno.type === 'text') {
            const style = anno.style || { fontSize: 16, fontFamily: 'Helvetica', color: '#000000' };
            const font = getPdfFont(style.fontFamily, style.isBold, style.isItalic);
            const color = hexToRgb(style.color);

            copiedPage.drawText(anno.content, {
              x: anno.x * width,
              y: height - (anno.y * height),
              size: style.fontSize,
              font: font,
              color: color,
            });
            
            if (style.isUnderline) {
                const textWidth = font.widthOfTextAtSize(anno.content, style.fontSize);
                copiedPage.drawLine({
                    start: { x: anno.x * width, y: height - (anno.y * height) - 2 },
                    end: { x: (anno.x * width) + textWidth, y: height - (anno.y * height) - 2 },
                    thickness: 1,
                    color: color,
                });
            }

          } else if (anno.type === 'drawing_layer') {
              const pngImage = await newPdf.embedPng(anno.dataUrl);
              copiedPage.drawImage(pngImage, { x: 0, y: 0, width, height });
          } else if (anno.type === 'image') {
              const pngImage = await newPdf.embedPng(anno.content);
              const imgDims = pngImage.scale(0.5);
              copiedPage.drawImage(pngImage, {
                  x: anno.x * width - (imgDims.width / 2),
                  y: height - (anno.y * height) - (imgDims.height / 2),
                  width: imgDims.width,
                  height: imgDims.height,
              });
          }
        }
        newPdf.addPage(copiedPage);
      }
      
      const pdfBytes = await newPdf.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'edited_document.pdf';
      link.click();
    } catch (err) {
      console.error(err);
      alert("Error saving.");
    } finally {
      setIsProcessing(false);
    }
  };

  // --- SIGNATURE & UTILS ---
  const SignatureModal = ({ onClose, onSave }) => {
    const [activeTab, setActiveTab] = useState('draw');
    const [typedText, setTypedText] = useState('');
    const [applyToAll, setApplyToAll] = useState(false);
    const [position, setPosition] = useState('center'); 
    const sigCanvasRef = useRef(null);

    const handleSave = () => {
      let dataUrl;
      if (activeTab === 'draw') {
        dataUrl = sigCanvasRef.current.toDataURL();
      } else {
        const canvas = document.createElement('canvas');
        canvas.width = 400; canvas.height = 100;
        const ctx = canvas.getContext('2d');
        ctx.font = "40px 'Dancing Script', cursive";
        ctx.fillStyle = 'black';
        ctx.fillText(typedText, 20, 60);
        dataUrl = canvas.toDataURL();
      }
      onSave(dataUrl, { position, applyToAll });
    };

    const getSigCoords = (e, rect) => {
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return { x: clientX - rect.left, y: clientY - rect.top };
    }
    const startDraw = (e) => {
        e.preventDefault();
        const ctx = sigCanvasRef.current.getContext('2d');
        const rect = sigCanvasRef.current.getBoundingClientRect();
        const {x, y} = getSigCoords(e, rect);
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineWidth = 2;
    };
    const moveDraw = (e) => {
        e.preventDefault();
        if (e.buttons !== 1 && (!e.touches)) return;
        const ctx = sigCanvasRef.current.getContext('2d');
        const rect = sigCanvasRef.current.getBoundingClientRect();
        const {x, y} = getSigCoords(e, rect);
        ctx.lineTo(x, y); ctx.stroke();
    };

    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex border-b shrink-0">
                <button onClick={() => setActiveTab('draw')} className={`flex-1 py-3 font-medium ${activeTab === 'draw' ? 'bg-blue-50 text-blue-600 border-b-2 border-blue-600' : 'text-gray-500'}`}>Draw</button>
                <button onClick={() => setActiveTab('type')} className={`flex-1 py-3 font-medium ${activeTab === 'type' ? 'bg-blue-50 text-blue-600 border-b-2 border-blue-600' : 'text-gray-500'}`}>Type</button>
            </div>
            <div className="p-6 h-64 flex flex-col justify-center bg-gray-50 shrink-0">
                {activeTab === 'draw' ? (
                    <canvas ref={sigCanvasRef} width={400} height={200} className="bg-white border border-gray-300 rounded shadow-sm w-full h-full cursor-crosshair touch-none" onMouseDown={startDraw} onMouseMove={moveDraw} onTouchStart={startDraw} onTouchMove={moveDraw} />
                ) : (
                    <input type="text" placeholder="Type name" className="w-full text-4xl p-4 border-b-2 border-gray-300 focus:border-blue-500 outline-none bg-transparent text-center font-['Dancing_Script']" value={typedText} onChange={(e) => setTypedText(e.target.value)} />
                )}
            </div>
            <div className="p-4 overflow-y-auto">
                <div className="grid grid-cols-3 gap-2 mb-4">
                    {['Top Left:tl', 'Top Right:tr', 'Center:center', 'Bottom Left:bl', 'Bottom Right:br'].map(opt => {
                        const [label, val] = opt.split(':');
                        return <button key={val} onClick={() => setPosition(val)} className={`text-xs p-2 rounded border ${position === val ? 'bg-blue-100 border-blue-500 text-blue-700' : 'border-gray-200 hover:bg-gray-50'}`}>{label}</button>
                    })}
                </div>
                <label className="flex items-center gap-2 p-2 border rounded hover:bg-gray-50 cursor-pointer">
                    <input type="checkbox" checked={applyToAll} onChange={e => setApplyToAll(e.target.checked)} className="rounded text-blue-600" /> <span className="text-sm font-medium">Apply to ALL pages</span>
                </label>
            </div>
            <div className="p-4 bg-white border-t flex justify-end gap-2 shrink-0">
                <button onClick={onClose} className="px-4 py-2 text-gray-500 hover:bg-gray-100 rounded-lg">Cancel</button>
                <button onClick={handleSave} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">Add</button>
            </div>
        </div>
      </div>
    );
  };

  const movePage = (index, direction) => {
    if ((direction === -1 && index === 0) || (direction === 1 && index === pages.length - 1)) return;
    const newPages = [...pages];
    const temp = newPages[index];
    newPages[index] = newPages[index + direction];
    newPages[index + direction] = temp;
    setPages(newPages);
    if (activePageIndex === index) setActivePageIndex(index + direction);
    else if (activePageIndex === index + direction) setActivePageIndex(index);
    const newAnnos = { ...annotations };
    const tempAnno = newAnnos[index];
    newAnnos[index] = newAnnos[index + direction];
    newAnnos[index + direction] = tempAnno;
    setAnnotations(newAnnos);
  };
  
  const rotatePage = (index) => {
    setPages(prev => prev.map((p, i) => i === index ? { ...p, rotation: (p.rotation + 90) % 360 } : p));
  };
  
  const deletePage = (index) => {
    if (pages.length <= 1) return alert("Cannot delete only page");
    const newPages = pages.filter((_, i) => i !== index);
    setPages(newPages);
    if (activePageIndex >= newPages.length) setActivePageIndex(newPages.length - 1);
  };

  if (!isLibrariesLoaded) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin text-blue-600" /></div>;

  if (!pdfFile) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 font-sans">
        <div className="bg-white p-12 rounded-2xl shadow-xl border border-slate-100 max-w-lg w-full text-center">
          <div className="w-20 h-20 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-6 transform rotate-3">
            <FileText className="w-10 h-10 text-blue-600" />
          </div>
          <h1 className="text-3xl font-extrabold text-slate-800 mb-3 tracking-tight">PDF Editor</h1>
          <p className="text-slate-500 mb-10 text-lg">Secure, local-only editing. No server uploads.</p>
          <label className="group relative block w-full cursor-pointer overflow-hidden rounded-xl bg-blue-600 py-4 px-6 text-white shadow-lg shadow-blue-500/30 transition-all hover:bg-blue-700 hover:-translate-y-1">
            <div className="flex items-center justify-center gap-3 font-semibold text-lg">
                <Upload className="w-6 h-6" /> <span>Open PDF Document</span>
            </div>
            <input type="file" accept="application/pdf" className="hidden" onChange={handleFileUpload} />
          </label>
        </div>
      </div>
    );
  }

  return (
    <div 
        className="h-screen flex flex-col bg-slate-100 font-sans text-slate-800"
        onMouseMove={handleGlobalMouseMove}
        onMouseUp={handleGlobalMouseUp}
        onTouchMove={handleGlobalMouseMove}
        onTouchEnd={handleGlobalMouseUp}
    >
      {showSignatureModal && <SignatureModal onClose={() => setShowSignatureModal(false)} onSave={addSignature} />}

      <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between shadow-sm z-20">
        <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white"><FileText className="w-5 h-5" /></div>
            <h1 className="font-bold text-lg hidden md:block">PDF Editor</h1>
        </div>
        
        <div className="flex items-center gap-4">
            <div className="flex items-center bg-slate-100 p-1 rounded-xl gap-1 overflow-x-auto">
                <ToolButton active={tool === 'cursor'} onClick={() => setTool('cursor')} icon={MousePointer} label="Select" />
                <div className="w-px h-6 bg-slate-300 mx-1"></div>
                <ToolButton active={tool === 'whiteout'} onClick={() => setTool('whiteout')} icon={Eraser} label="Whiteout" />
                <ToolButton active={tool === 'text'} onClick={() => setTool('text')} icon={Type} label="Text" />
                <ToolButton active={false} onClick={() => setShowSignatureModal(true)} icon={ImageIcon} label="Sign" />
                <div className="w-px h-6 bg-slate-300 mx-1"></div>
                <ToolButton active={tool === 'draw'} onClick={() => setTool('draw')} icon={Pen} label="Draw" />
            </div>

            <button onClick={savePdf} disabled={isProcessing} className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-semibold shadow-md flex items-center gap-2">
            {isProcessing ? <Loader2 className="w-4 h-4 animate-spin"/> : <Save className="w-4 h-4" />} <span className="hidden sm:inline">Save</span>
            </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-64 bg-white border-r border-slate-200 flex flex-col z-10">
            <div className="p-4 border-b border-slate-100 bg-slate-50"><h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Pages ({pages.length})</h2></div>
            <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
                {pages.map((page, idx) => (
                    <div key={idx} onClick={() => setActivePageIndex(idx)} className={`relative group p-3 rounded-xl border-2 cursor-pointer transition-all ${activePageIndex === idx ? 'border-blue-600 bg-blue-50' : 'border-transparent hover:bg-slate-50'}`}>
                        <div className="flex justify-between items-center mb-2">
                            <span className={`text-xs font-bold px-2 py-0.5 rounded ${activePageIndex === idx ? 'bg-blue-200 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>#{idx + 1}</span>
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-white shadow-sm rounded-lg p-1 absolute right-2 top-2">
                                <button onClick={(e) => { e.stopPropagation(); movePage(idx, -1); }} className="p-1 hover:bg-slate-100 rounded text-slate-600"><MoveUp className="w-3 h-3" /></button>
                                <button onClick={(e) => { e.stopPropagation(); movePage(idx, 1); }} className="p-1 hover:bg-slate-100 rounded text-slate-600"><MoveDown className="w-3 h-3" /></button>
                                <button onClick={(e) => { e.stopPropagation(); deletePage(idx); }} className="p-1 hover:bg-red-50 rounded text-red-500"><Trash2 className="w-3 h-3" /></button>
                            </div>
                        </div>
                        <div className="relative aspect-[3/4] bg-slate-200 rounded-lg overflow-hidden border border-slate-200 shadow-sm">
                             <img src={page.dataUrl} className="w-full h-full object-contain bg-white" style={{ transform: `rotate(${page.rotation}deg)` }} alt={`Page ${idx+1}`} />
                        </div>
                        <div className="mt-2 flex justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                             <button onClick={(e) => { e.stopPropagation(); rotatePage(idx); }} className="text-xs flex items-center gap-1 text-slate-500 hover:text-blue-600 bg-slate-100 px-2 py-1 rounded-md"><RotateCw className="w-3 h-3" /> Rotate</button>
                        </div>
                    </div>
                ))}
            </div>
        </div>

        <div className="flex-1 bg-slate-100 overflow-auto flex justify-center p-8 relative custom-scrollbar">
             {pages[activePageIndex] && (
                 <div ref={containerRef} className="relative shadow-2xl transition-all" style={{ width: 'fit-content', height: 'fit-content' }}>
                     <canvas ref={pdfCanvasRef} className="block bg-white" />
                     <canvas 
                        ref={drawCanvasRef}
                        className={`absolute inset-0 touch-none cursor-${tool === 'text' ? 'text' : tool === 'cursor' ? 'default' : 'crosshair'}`}
                        style={{ zIndex: 10 }}
                        onMouseDown={handleCanvasLayerDown} 
                        onTouchStart={handleCanvasLayerDown}
                     />

                     {/* FLOATING TOOLBAR */}
                     {(inputBox || (selectedAnnotationIndex !== null && annotations[activePageIndex][selectedAnnotationIndex]?.type === 'text')) && (
                         <FloatingToolbar 
                            style={inputBox ? inputBox.style : annotations[activePageIndex][selectedAnnotationIndex].style} 
                            onUpdate={updateFormatting} 
                            onDelete={inputBox ? deleteInputBox : (e) => deleteAnnotation(e, selectedAnnotationIndex)}
                            onDragStart={inputBox ? handleInputBoxDragStart : undefined}
                         />
                     )}

                     {/* TEXT INPUT BOX */}
                     {inputBox && (
                         <input
                            autoFocus
                            className="absolute bg-transparent border-2 border-blue-500 p-0.5 z-50 focus:outline-none"
                            style={{ 
                                left: inputBox.x, 
                                top: inputBox.y,
                                transform: 'translate(0, -100%)', 
                                fontFamily: inputBox.style.fontFamily === 'Times' ? 'Times New Roman, serif' : inputBox.style.fontFamily === 'Courier' ? 'Courier New, monospace' : 'Helvetica, sans-serif',
                                fontSize: `${inputBox.style.fontSize}px`,
                                fontWeight: inputBox.style.isBold ? 'bold' : 'normal',
                                fontStyle: inputBox.style.isItalic ? 'italic' : 'normal',
                                textDecoration: inputBox.style.isUnderline ? 'underline' : 'none',
                                color: inputBox.style.color,
                                minWidth: '100px'
                            }}
                            value={inputBox.text}
                            onChange={(e) => setInputBox({...inputBox, text: e.target.value})}
                            onBlur={(e) => {
                                // Only confirm if not dragging input
                                if (!dragging || dragging.type !== 'input') {
                                    handleInputConfirm(e.target.value);
                                }
                            }}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleInputConfirm(e.currentTarget.value);
                                if (e.key === 'Escape') deleteInputBox();
                            }}
                         />
                     )}

                     <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 20 }}>
                        {(annotations[activePageIndex] || []).map((anno, i) => {
                             const isSelected = selectedAnnotationIndex === i && editingIndex !== i;
                             const isEditing = editingIndex === i;
                             
                             if (isEditing) return null; 

                             const commonStyle = {
                                 position: 'absolute',
                                 left: `${anno.x * 100}%`, top: `${anno.y * 100}%`,
                                 cursor: tool === 'cursor' ? (dragging ? 'grabbing' : 'grab') : 'default',
                                 pointerEvents: tool === 'cursor' ? 'auto' : 'none',
                                 border: isSelected ? '1px dashed #3b82f6' : '1px solid transparent',
                             };

                             if (anno.type === 'text') {
                                 const s = anno.style || {};
                                 return (
                                     <div key={i} 
                                          onMouseDown={(e) => handleAnnotationMouseDown(e, i)}
                                          onTouchStart={(e) => handleAnnotationMouseDown(e, i)}
                                          onDoubleClick={(e) => handleAnnotationDoubleClick(e, i)}
                                          className="hover:bg-blue-50/10 group"
                                          style={{ 
                                              ...commonStyle, 
                                              transform: 'translate(0, -100%)', 
                                              fontFamily: s.fontFamily === 'Times' ? 'Times New Roman, serif' : s.fontFamily === 'Courier' ? 'Courier New, monospace' : 'Helvetica, sans-serif',
                                              fontSize: `${s.fontSize}px`,
                                              fontWeight: s.isBold ? 'bold' : 'normal',
                                              fontStyle: s.isItalic ? 'italic' : 'normal',
                                              textDecoration: s.isUnderline ? 'underline' : 'none',
                                              color: s.color || 'black',
                                              whiteSpace: 'nowrap'
                                          }}>
                                         {anno.content}
                                         {isSelected && (
                                             <button onClick={(e) => deleteAnnotation(e, i)} className="absolute -top-3 -right-3 bg-red-500 text-white rounded-full p-0.5 shadow-md hover:bg-red-600 pointer-events-auto"><X className="w-3 h-3" /></button>
                                         )}
                                     </div>
                                 );
                             } else if (anno.type === 'image') {
                                 return (
                                    <div key={i}
                                         onMouseDown={(e) => handleAnnotationMouseDown(e, i)}
                                         onTouchStart={(e) => handleAnnotationMouseDown(e, i)}
                                         style={{ ...commonStyle, width: `${anno.width * 100}%`, transform: 'translate(-50%, -50%)' }}>
                                         <img src={anno.content} className="w-full select-none pointer-events-none" alt="signature" />
                                         {isSelected && (
                                             <button onClick={(e) => deleteAnnotation(e, i)} className="absolute -top-3 -right-3 bg-red-500 text-white rounded-full p-0.5 shadow-md hover:bg-red-600 pointer-events-auto"><X className="w-3 h-3" /></button>
                                         )}
                                    </div>
                                 );
                             }
                             return null;
                        })}
                     </div>
                 </div>
             )}
        </div>
      </div>
    </div>
  );
}

const ToolButton = ({ active, onClick, icon: Icon, label }) => (
    <button onClick={onClick} className={`flex flex-col items-center justify-center px-3 py-2 rounded-lg transition-all ${active ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:bg-slate-200'}`} title={label}>
        <Icon className="w-5 h-5 mb-0.5" /> <span className="text-[10px] font-medium">{label}</span>
    </button>
);