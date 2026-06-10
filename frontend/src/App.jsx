import React, { useState, useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { 
  Video, 
  UploadCloud, 
  Copy, 
  Download, 
  FileText, 
  Search, 
  Bell, 
  Settings, 
  Plus, 
  Play, 
  CheckCircle2, 
  Clock, 
  History, 
  Trash2, 
  ExternalLink 
} from 'lucide-react';

// WebGL Background Shader Component
const ShaderBackground = () => {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const syncSize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    };

    window.addEventListener('resize', syncSize);
    syncSize();

    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) return;

    const vs = `
      attribute vec2 a_position;
      varying vec2 v_texCoord;
      void main() {
        v_texCoord = a_position * 0.5 + 0.5;
        gl_Position = vec4(a_position, 0.0, 1.0);
      }
    `;

    const fs = `
      precision highp float;
      varying vec2 v_texCoord;
      uniform float u_time;
      uniform vec2 u_resolution;
      uniform vec2 u_mouse;

      void main() {
          vec2 uv = v_texCoord;
          vec2 center = vec2(0.5, 0.5);
          
          // Create organic movement using sine waves
          float d = distance(uv, center);
          float pulse = sin(d * 8.0 - u_time * 1.5) * 0.08;
          
          // Base Obsidian color
          vec3 obsidian = vec3(0.04, 0.04, 0.08); // #080810 approx
          
          // Amethyst glow
          vec3 amethyst = vec3(0.57, 0.2, 0.91); // #9333EA
          float glow = smoothstep(0.55 + pulse, 0.0, d) * 0.25;
          
          // Aqua hints based on mouse
          vec2 mouseNorm = u_mouse / u_resolution;
          float dMouse = distance(uv, mouseNorm);
          vec3 aqua = vec3(0.02, 0.71, 0.83); // #06B6D4
          float sparkle = pow(max(0.0, sin(uv.x * 15.0 + u_time) * cos(uv.y * 12.0 - u_time)), 40.0);
          float mouseGlow = smoothstep(0.3, 0.0, dMouse) * 0.15;
          
          vec3 finalColor = mix(obsidian, amethyst, glow);
          finalColor += aqua * (sparkle * 0.15 + mouseGlow);
          
          gl_FragColor = vec4(finalColor, 1.0);
      }
    `;

    const cs = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(s));
      }
      return s;
    };

    const prog = gl.createProgram();
    gl.attachShader(prog, cs(gl.VERTEX_SHADER, vs));
    gl.attachShader(prog, cs(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(prog);
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

    const pos = gl.getAttribLocation(prog, 'a_position');
    gl.enableVertexAttribArray(pos);
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);

    const uTime = gl.getUniformLocation(prog, 'u_time');
    const uRes = gl.getUniformLocation(prog, 'u_resolution');
    const uMouse = gl.getUniformLocation(prog, 'u_mouse');

    let mouse = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const handleMouseMove = (e) => {
      mouse.x = e.clientX;
      mouse.y = window.innerHeight - e.clientY;
    };
    window.addEventListener('mousemove', handleMouseMove);

    let animationFrameId;
    const render = (t) => {
      syncSize();
      gl.viewport(0, 0, canvas.width, canvas.height);
      if (uTime) gl.uniform1f(uTime, t * 0.001);
      if (uRes) gl.uniform2f(uRes, canvas.width, canvas.height);
      if (uMouse) gl.uniform2f(uMouse, mouse.x, mouse.y);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      animationFrameId = requestAnimationFrame(render);
    };
    render(0);

    return () => {
      window.removeEventListener('resize', syncSize);
      window.removeEventListener('mousemove', handleMouseMove);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <div className="fixed inset-0 w-full h-full z-0 opacity-40 pointer-events-none">
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
    </div>
  );
};

export default function App() {
  const [videoFile, setVideoFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState("Ingesting video frames...");
  const [results, setResults] = useState(null);
  const [selectedLanguage, setSelectedLanguage] = useState("english");
  const [history, setHistory] = useState([]);
  const [sidebarIndex, setSidebarIndex] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const [toastMessage, setToastMessage] = useState("");

  const fileInputRef = useRef(null);
  const videoPlayerRef = useRef(null);
  const navIndicatorRef = useRef(null);
  const langPillRef = useRef(null);
  const resultsContainerRef = useRef(null);
  const sidebarContainerRef = useRef(null);

  // Status message loops
  const statuses = [
    'Ingesting video frames...',
    'Uploading content to Gemini Cloud...',
    'Listening to audio transcript...',
    'Analyzing visual patterns...',
    'Translating key terms to Hinglish...',
    'Crafting summary highlights...',
    'Finalizing neural annotations...'
  ];

  // Load history on mount
  useEffect(() => {
    const saved = localStorage.getItem('vidnotes_history');
    if (saved) {
      try {
        setHistory(JSON.parse(saved));
      } catch (e) {
        console.error(e);
      }
    }
  }, []);

  // Save history helper
  const saveToHistory = (newEntry) => {
    const updated = [newEntry, ...history.filter(h => h.id !== newEntry.id)].slice(0, 10);
    setHistory(updated);
    localStorage.setItem('vidnotes_history', JSON.stringify(updated));
  };

  const deleteHistoryItem = (id, e) => {
    e.stopPropagation();
    const updated = history.filter(h => h.id !== id);
    setHistory(updated);
    localStorage.setItem('vidnotes_history', JSON.stringify(updated));
    if (results && results.id === id) {
      setResults(null);
      setVideoUrl(null);
      setVideoFile(null);
    }
    showToast("History item deleted");
  };

  // Toast notifier helper
  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(""), 3000);
  };

  // Sidebar navigation indicator slide
  useEffect(() => {
    const navContainer = sidebarContainerRef.current;
    if (!navContainer || !navIndicatorRef.current) return;
    const items = navContainer.querySelectorAll('.nav-item');
    const target = items[sidebarIndex];
    if (target) {
      const rect = target.getBoundingClientRect();
      const parentRect = navContainer.getBoundingClientRect();
      const top = rect.top - parentRect.top;
      
      gsap.to(navIndicatorRef.current, {
        y: top,
        duration: 0.5,
        ease: "elastic.out(1, 0.75)"
      });
    }
  }, [sidebarIndex]);

  // Language pill slide
  useEffect(() => {
    if (!langPillRef.current) return;
    const btnWidth = langPillRef.current.parentElement.clientWidth / 2;
    const targetX = selectedLanguage === 'hinglish' ? btnWidth - 6 : 0;
    
    gsap.to(langPillRef.current, {
      x: targetX,
      duration: 0.4,
      ease: "power4.out"
    });
  }, [selectedLanguage]);

  // 3D Card tilt effect setup
  useEffect(() => {
    const handleMouseMove = (e, card) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      const rotateX = (y - centerY) / 20;
      const rotateY = (centerX - x) / 20;
      
      gsap.to(card, {
        rotateX: rotateX,
        rotateY: rotateY,
        duration: 0.5,
        ease: "power2.out"
      });
    };

    const handleMouseLeave = (card) => {
      gsap.to(card, {
        rotateX: 0,
        rotateY: 0,
        duration: 0.8,
        ease: "elastic.out(1, 0.3)"
      });
    };

    const cards = document.querySelectorAll('.glass-panel-3d');
    cards.forEach(card => {
      const onMove = (e) => handleMouseMove(e, card);
      const onLeave = () => handleMouseLeave(card);
      card.addEventListener('mousemove', onMove);
      card.addEventListener('mouseleave', onLeave);
      card._clean = () => {
        card.removeEventListener('mousemove', onMove);
        card.removeEventListener('mouseleave', onLeave);
      };
    });

    return () => {
      cards.forEach(card => {
        if (card._clean) card._clean();
      });
    };
  }, [results, isProcessing]);

  // Stagger entry animation for results
  useEffect(() => {
    if (results && resultsContainerRef.current) {
      gsap.fromTo(resultsContainerRef.current.children, 
        { opacity: 0, y: 30 },
        { 
          opacity: 1, 
          y: 0, 
          duration: 0.8, 
          stagger: 0.15, 
          ease: "power4.out",
          clearProps: "all"
        }
      );
    }
  }, [results]);

  // Dynamic status cycler when processing
  useEffect(() => {
    if (!isProcessing) return;
    let index = 0;
    const interval = setInterval(() => {
      index = (index + 1) % statuses.length;
      setProcessingStatus(statuses[index]);
    }, 4500);

    return () => clearInterval(interval);
  }, [isProcessing]);

  // Handle Drag & Drop events
  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('video/')) {
      processVideoFile(file);
    } else {
      setErrorMessage("Please drop a valid video file (mp4, webm, avi, mov).");
    }
  };

  const selectFile = (e) => {
    const file = e.target.files[0];
    if (file) {
      processVideoFile(file);
    }
  };

  // Main Upload & Processing Flow
  const processVideoFile = async (file) => {
    setErrorMessage("");
    setVideoFile(file);
    setVideoUrl(URL.createObjectURL(file));
    setResults(null);
    setIsUploading(true);
    setUploadProgress(10);

    // Dynamic fake upload progress
    const progressInterval = setInterval(() => {
      setUploadProgress(prev => {
        if (prev >= 90) {
          clearInterval(progressInterval);
          return 90;
        }
        return prev + 10;
      });
    }, 500);

    const formData = new FormData();
    formData.append('video', file);

    try {
      const apiBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
      const response = await fetch(`${apiBaseUrl}/api/summarize`, {
        method: 'POST',
        body: formData
      });

      clearInterval(progressInterval);
      setUploadProgress(100);
      setIsUploading(false);
      setIsProcessing(true);
      setProcessingStatus("Gemini is analyzing video transcript...");

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Server error occurred during processing.');
      }

      setIsProcessing(false);
      const newResult = {
        id: Date.now().toString(),
        videoName: file.name,
        processedAt: new Date().toLocaleString(),
        duration: "Computed",
        modelUsed: data.modelUsed || "Gemini 2.5 Flash",
        results: data.results
      };

      setResults(newResult);
      saveToHistory(newResult);
      showToast("Video summarized successfully!");

    } catch (err) {
      clearInterval(progressInterval);
      setIsUploading(false);
      setIsProcessing(false);
      setErrorMessage(err.message || "Failed to analyze video. Make sure server is running and API key is set.");
      console.error(err);
    }
  };

  // Load selected video from history
  const loadHistoryItem = (item) => {
    setErrorMessage("");
    setResults(item);
    setVideoFile({ name: item.videoName });
    setVideoUrl(null); // Local object URL expired, we just show placeholder player or empty state
    showToast(`Loaded notes for: ${item.videoName}`);
  };

  // Copy elements to clipboard
  const copyToClipboard = () => {
    if (!results) return;
    const data = results.results[selectedLanguage];
    const text = `
VidNotes Summary: ${results.videoName}

Executive Summary:
${data.summary}

Key Highlights:
${data.keyPoints.map(p => `- ${p}`).join('\n')}

Detailed Annotated Notes:
${data.notes.map(n => `- ${n}`).join('\n')}
    `;
    navigator.clipboard.writeText(text);
    showToast("Notes copied to clipboard!");
  };

  // Download Markdown file
  const downloadMarkdown = () => {
    if (!results) return;
    const data = results.results[selectedLanguage];
    const content = `
# VidNotes AI | ${results.videoName}
*Processed at: ${results.processedAt}*

## Executive Summary
${data.summary}

## Key Highlights
${data.keyPoints.map(p => `* ${p}`).join('\n')}

## Detailed Study Notes
${data.notes.map(n => `* ${n}`).join('\n')}
    `;
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${results.videoName.replace(/\.[^/.]+$/, "")}_notes_${selectedLanguage}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast("Markdown exported!");
  };

  // Reset workspace
  const handleNewNoteClick = () => {
    setVideoFile(null);
    setVideoUrl(null);
    setResults(null);
    setErrorMessage("");
  };

  return (
    <div className="min-h-screen relative overflow-x-hidden font-body-md text-on-surface select-none">
      <ShaderBackground />
      
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-6 right-6 z-50 glass-panel px-6 py-3 rounded-full border border-primary/30 flex items-center gap-3 animate-fade-in shadow-[0_0_20px_rgba(147,51,234,0.3)]">
          <div className="w-2 h-2 rounded-full bg-secondary animate-ping"></div>
          <span className="text-sm font-semibold tracking-wider font-label-caps text-on-primary-container">{toastMessage}</span>
        </div>
      )}

      {/* Top App Bar */}
      <header className="fixed top-0 w-full z-50 flex items-center justify-between px-gutter py-4 bg-surface/40 backdrop-blur-3xl border-b border-white/5 shadow-sm">
        <div className="flex items-center gap-4">
          <span className="font-headline-md text-2xl font-bold tracking-tight text-primary cursor-pointer" onClick={handleNewNoteClick}>
            VidNotes
          </span>
          <div className="hidden md:flex bg-white/5 rounded-full px-4 py-1.5 border border-white/5 items-center gap-2">
            <Search className="text-primary w-4 h-4" />
            <input 
              className="bg-transparent border-none outline-none text-body-md text-on-surface-variant w-48 focus:ring-0 placeholder:text-white/20" 
              placeholder="Search library..." 
              type="text"
            />
          </div>
        </div>
      </header>

      {/* Navigation & Sidebar */}
      <nav className="fixed left-6 top-28 bottom-6 w-64 glass-panel rounded-3xl z-40 p-4 flex flex-col justify-between border border-white/10">
        <div className="relative">
          {/* GSAP Indicator background */}
          <div ref={navIndicatorRef} className="liquid-pill-indicator"></div>
          
          <div ref={sidebarContainerRef} className="flex flex-col gap-2 relative">
            <button 
              className={`nav-item flex items-center gap-4 px-4 py-3 rounded-xl transition-all duration-300 w-full text-left z-10 ${sidebarIndex === 0 ? 'text-on-primary-container font-bold' : 'text-on-surface-variant hover:text-on-surface'}`}
              onClick={() => setSidebarIndex(0)}
            >
              <History className="w-5 h-5" />
              <span className="font-label-caps text-[11px] tracking-wider uppercase">Dashboard</span>
            </button>
            <button 
              className={`nav-item flex items-center gap-4 px-4 py-3 rounded-xl transition-all duration-300 w-full text-left z-10 ${sidebarIndex === 1 ? 'text-on-primary-container font-bold' : 'text-on-surface-variant hover:text-on-surface'}`}
              onClick={() => { setSidebarIndex(1); showToast("Library opened"); }}
            >
              <Video className="w-5 h-5" />
              <span className="font-label-caps text-[11px] tracking-wider uppercase">Library</span>
            </button>
          </div>
          
          <div className="mt-8 px-2">
            <button 
              onClick={handleNewNoteClick}
              className="w-full py-4 bg-primary-container text-on-primary-container rounded-2xl font-semibold flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(147,51,234,0.3)] hover:scale-[1.02] active:scale-95 transition-all"
            >
              <Plus className="w-5 h-5" />
              New Note
            </button>
          </div>
        </div>

        {/* History / Recent Panel */}
        <div className="flex flex-col gap-3 mt-4 overflow-y-auto max-h-[300px] pr-1 border-t border-white/5 pt-4">
          <span className="text-[10px] font-label-caps tracking-[0.2em] text-on-surface-variant px-2">RECENT HISTORY</span>
          {history.length === 0 ? (
            <span className="text-xs text-white/20 italic px-2">No past summaries</span>
          ) : (
            history.map((item) => (
              <div 
                key={item.id} 
                onClick={() => loadHistoryItem(item)}
                className={`group flex items-center justify-between p-2 rounded-xl border border-transparent hover:border-white/5 hover:bg-white/5 cursor-pointer transition-all ${results?.id === item.id ? 'bg-primary/10 border-primary/20' : ''}`}
              >
                <div className="flex items-center gap-2 overflow-hidden">
                  <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0">
                    <Video className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex flex-col overflow-hidden">
                    <span className="text-xs font-semibold text-on-surface truncate pr-2 w-32">{item.videoName}</span>
                    <span className="text-[9px] text-white/30 truncate">{item.processedAt}</span>
                  </div>
                </div>
                <button 
                  onClick={(e) => deleteHistoryItem(item.id, e)}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 transition-opacity"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>


      </nav>

      {/* Main Canvas Area */}
      <main className="ml-80 mr-gutter pt-28 pb-10 flex gap-8">
        
        {/* Left Side: Video & Upload Card */}
        <div className="flex-1 flex flex-col gap-8 min-w-[400px]">
          
          {/* Error Message */}
          {errorMessage && (
            <div className="bg-red-950/40 border border-red-500/30 text-red-200 px-6 py-4 rounded-3xl text-sm">
              {errorMessage}
            </div>
          )}

          <div className="relative glass-panel rounded-[2.5rem] p-4 ambilight-shadow overflow-hidden group">
            
            {/* If no video has been uploaded yet */}
            {!videoFile && !isUploading && !isProcessing && (
              <div 
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current.click()}
                className="aspect-video bg-black/40 rounded-[2rem] border-2 border-dashed border-white/10 hover:border-primary/40 flex flex-col items-center justify-center gap-4 cursor-pointer transition-all duration-300"
              >
                <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center border border-white/5 group-hover:scale-105 transition-transform">
                  <UploadCloud className="w-8 h-8 text-primary" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-on-surface">Drag & drop your video here</p>
                  <p className="text-xs text-on-surface-variant mt-1">Or click to browse from local computer</p>
                  <p className="text-[10px] text-white/20 mt-4 uppercase tracking-widest font-label-caps">MP4, WEBM, AVI, MOV up to 2GB</p>
                </div>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={selectFile} 
                  className="hidden" 
                  accept="video/*" 
                />
              </div>
            )}

            {/* If Uploading to Backend */}
            {isUploading && (
              <div className="aspect-video bg-black/60 rounded-[2rem] flex flex-col items-center justify-center gap-6 relative">
                <div className="text-center z-10">
                  <p className="text-sm font-semibold text-on-surface">Uploading video to server...</p>
                  <p className="text-[11px] text-on-surface-variant mt-1">{uploadProgress}% Uploaded</p>
                </div>
                <div className="w-48 h-1.5 bg-white/5 rounded-full overflow-hidden border border-white/5 z-10">
                  <div className="h-full bg-gradient-to-r from-primary to-secondary transition-all duration-300" style={{ width: `${uploadProgress}%` }}></div>
                </div>
                {/* Visual Glow */}
                <div className="absolute inset-0 bg-primary/10 rounded-[2rem] filter blur-xl opacity-30"></div>
              </div>
            )}

            {/* If Video Ingested on Gemini API */}
            {isProcessing && (
              <div className="aspect-video bg-black/60 rounded-[2rem] flex flex-col items-center justify-center gap-8 relative overflow-hidden">
                {/* Orbital Loader SVG */}
                <div className="relative w-24 h-24 z-10">
                  <svg className="w-full h-full animate-[spin_8s_linear_infinite]" viewBox="0 0 100 100">
                    <circle cx="50" cy="20" fill="#ddb8ff" r="6" className="animate-ping" style={{ animationDuration: '3s' }}></circle>
                    <circle cx="80" cy="50" fill="#4cd7f6" r="6" className="animate-ping" style={{ animationDuration: '2.5s' }}></circle>
                    <circle cx="20" cy="50" fill="#9333ea" r="6" className="animate-ping" style={{ animationDuration: '2s' }}></circle>
                  </svg>
                  <div className="absolute inset-0 blur-xl opacity-30 bg-primary rounded-full"></div>
                </div>
                <div className="flex flex-col items-center gap-2 z-10">
                  <span className="text-on-surface font-headline-md text-xl tracking-wide opacity-90">{processingStatus}</span>
                  <div className="flex gap-1.5 mt-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                    <div className="w-1.5 h-1.5 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                    <div className="w-1.5 h-1.5 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: '0.3s' }}></div>
                  </div>
                </div>
                {/* Ingestion progress tracking */}
                <div className="absolute bottom-6 right-6 flex items-center gap-2 px-4 py-2 bg-secondary/20 backdrop-blur-2xl border border-secondary/40 rounded-full">
                  <div className="w-2 h-2 rounded-full bg-secondary animate-pulse"></div>
                  <span className="font-label-caps text-[10px] text-secondary tracking-widest">PROCESSING</span>
                </div>
              </div>
            )}

            {/* Display Video Player once selected (even if no results loaded yet) */}
            {videoFile && !isUploading && !isProcessing && (
              <div className="aspect-video bg-black rounded-[2rem] overflow-hidden relative border border-white/5">
                {videoUrl ? (
                  <video 
                    ref={videoPlayerRef} 
                    src={videoUrl} 
                    className="w-full h-full object-cover" 
                    controls 
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-white/5 relative">
                    <Video className="w-16 h-16 text-primary/40" />
                    <span className="text-xs text-on-surface-variant mt-2 font-semibold italic">Loaded from History: {videoFile.name}</span>
                    <button 
                      onClick={() => fileInputRef.current?.click()} 
                      className="mt-4 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full text-xs font-semibold"
                    >
                      Re-upload local file to play
                    </button>
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      onChange={selectFile} 
                      className="hidden" 
                      accept="video/*" 
                    />
                  </div>
                )}
                
                {/* Active state badge */}
                {results && (
                  <div className="absolute bottom-6 right-6 flex items-center gap-2 px-4 py-2 bg-secondary/20 backdrop-blur-2xl border border-secondary/40 rounded-full active-upload-glow">
                    <div className="w-2 h-2 rounded-full bg-secondary"></div>
                    <span className="font-label-caps text-[10px] text-secondary tracking-widest">SYSTEM ACTIVE</span>
                  </div>
                )}
              </div>
            )}
            
            {/* Custom progress details */}
            {videoFile && !isUploading && !isProcessing && (
              <div className="mt-6 px-4">
                <div className="flex justify-between items-center text-[11px] font-label-caps text-on-surface-variant">
                  <span>File: {videoFile.name}</span>
                  <span>{results ? "Analyzed" : "File Ready"}</span>
                </div>
              </div>
            )}
          </div>

          {/* Bento Details Row */}
          {results && (
            <div className="grid grid-cols-2 gap-6 animate-fade-in">
              <div className="glass-panel p-6 rounded-3xl border border-white/5 flex flex-col gap-4">
                <h3 className="font-headline-md text-md text-primary-fixed-dim">Contextual Insights</h3>
                <p className="text-xs text-on-surface-variant leading-relaxed">
                  Key details and neural concepts have been annotated in the sidebar notes panel. Use tabs to view Hinglish definitions.
                </p>
              </div>
              <div className="glass-panel p-6 rounded-3xl border border-white/5 flex items-center justify-between">
                <div>
                  <h4 className="font-label-caps text-[10px] text-on-surface-variant mb-1">DASHBOARD INTEGRITY</h4>
                  <div className="flex items-center gap-1 text-secondary font-semibold text-xs mt-2">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{results.modelUsed ? results.modelUsed.replace('gemini-', 'Gemini ').replace('-lite', ' Lite') + ' Active' : 'Gemini 2.5 Active'}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Side: Tabbed Summaries & Annotated Notes */}
        <aside className="w-[440px] flex flex-col gap-6">
          
          {/* Language Switcher Toggle */}
          <div className="glass-panel p-1.5 rounded-full border border-white/10 bg-black/20 flex relative">
            <button 
              onClick={() => setSelectedLanguage("english")}
              className={`flex-1 py-2 text-center text-[11px] font-label-caps z-10 transition-colors uppercase font-bold ${selectedLanguage === 'english' ? 'text-on-primary-container' : 'text-on-surface-variant'}`}
            >
              ENGLISH
            </button>
            <button 
              onClick={() => setSelectedLanguage("hinglish")}
              className={`flex-1 py-2 text-center text-[11px] font-label-caps z-10 transition-colors uppercase font-bold ${selectedLanguage === 'hinglish' ? 'text-on-primary-container' : 'text-on-surface-variant'}`}
            >
              HINGLISH
            </button>
            <div ref={langPillRef} className="absolute top-1.5 bottom-1.5 left-1.5 w-[calc(50%-6px)] bg-primary/20 rounded-full border border-primary/30" id="lang-pill"></div>
          </div>

          {/* Skeleton Loaders during upload/process */}
          {(isUploading || isProcessing || !results) ? (
            <div className="glass-panel p-8 rounded-[2.5rem] border-white/5 flex flex-col gap-6 relative overflow-hidden flex-1 min-h-[500px]">
              <div className="absolute inset-0 grid-lines opacity-10 pointer-events-none"></div>
              
              <div className="flex flex-col gap-4">
                {/* Title Skeleton */}
                <div className="skeleton-block h-8 w-2/3 skeleton-shimmer"></div>
                {/* Body Text Skeleton */}
                <div className="space-y-3 mt-4">
                  <div className="skeleton-block h-4 w-full skeleton-shimmer"></div>
                  <div className="skeleton-block h-4 w-full skeleton-shimmer"></div>
                  <div className="skeleton-block h-4 w-4/5 skeleton-shimmer"></div>
                </div>
                {/* Bullets Skeleton */}
                <div className="flex flex-col gap-6 mt-8">
                  <div className="flex gap-4 items-center">
                    <div className="w-6 h-6 rounded-lg skeleton-block skeleton-shimmer"></div>
                    <div className="skeleton-block h-4 w-3/4 skeleton-shimmer"></div>
                  </div>
                  <div className="flex gap-4 items-center">
                    <div className="w-6 h-6 rounded-lg skeleton-block skeleton-shimmer"></div>
                    <div className="skeleton-block h-4 w-2/3 skeleton-shimmer"></div>
                  </div>
                </div>
              </div>
              
              <div className="mt-auto pt-6 border-t border-white/5">
                <span className="text-xs font-semibold text-primary/70 animate-pulse">
                  {isProcessing ? "Analyzing transcript patterns..." : "Upload a video file to begin..."}
                </span>
              </div>
            </div>
          ) : (
            // Results Panel
            <div ref={resultsContainerRef} className="flex-1 flex flex-col gap-6 min-h-[500px]">
              
              {/* Executive Summary Card */}
              <div className="glass-panel glass-panel-3d p-8 rounded-[2.5rem] border-white/5 flex flex-col gap-4">
                <h2 className="font-headline-md text-lg font-bold text-primary">
                  {selectedLanguage === 'english' ? "Executive Summary" : "Mukhya Saransh (Summary)"}
                </h2>
                <p className="font-serif-human italic text-lg text-on-surface-variant leading-relaxed">
                  "{results.results[selectedLanguage].summary}"
                </p>
              </div>

              {/* Key Highlights Card */}
              <div className="glass-panel glass-panel-3d p-8 rounded-[2.5rem] border-white/5 flex flex-col gap-4">
                <h3 className="font-headline-md text-md font-bold text-secondary">
                  {selectedLanguage === 'english' ? "Key Highlights" : "Khaas Baatein (Key Highlights)"}
                </h3>
                <div className="flex flex-col gap-4 mt-2">
                  {results.results[selectedLanguage].keyPoints.map((point, i) => (
                    <div key={i} className="flex items-start gap-4">
                      <div className="w-5 h-5 rounded-lg bg-secondary/10 flex items-center justify-center border border-secondary/20 mt-1 flex-shrink-0">
                        <CheckCircle2 className="w-3.5 h-3.5 text-secondary" />
                      </div>
                      <span className="text-xs text-on-surface-variant leading-relaxed">{point}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Annotated Notes Panel */}
              <div className="flex-1 glass-panel glass-panel-3d rounded-[2.5rem] border-white/5 p-8 flex flex-col gap-6 relative overflow-hidden">
                <div className="absolute inset-0 grid-lines opacity-10 pointer-events-none"></div>
                
                <div className="flex justify-between items-center z-10">
                  <h3 className="font-label-caps text-[10px] tracking-[0.2em] text-on-surface-variant">
                    {selectedLanguage === 'english' ? "ANNOTATED STUDY NOTES" : "ANNOTATED PADHAI NOTES"}
                  </h3>
                </div>
                
                <div className="space-y-4 z-10 overflow-y-auto max-h-[220px] pr-1">
                  {results.results[selectedLanguage].notes.map((note, i) => (
                    <div key={i} className="relative pl-6">
                      <div className="absolute left-0 top-2.5 w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_8px_#ddb8ff]"></div>
                      <p className="text-xs text-on-surface leading-loose">{note}</p>
                    </div>
                  ))}
                </div>
                
                {/* Download / Actions Panel */}
                <div className="mt-auto space-y-3 z-10">
                  <button 
                    onClick={copyToClipboard}
                    className="w-full py-3.5 rounded-full bg-gradient-to-r from-surface-container-high to-surface-container border border-white/10 text-on-surface text-xs font-semibold flex items-center justify-center gap-2 hover:border-white/20 hover:scale-[1.01] transition-all"
                  >
                    <Copy className="w-4 h-4" />
                    Copy Notes
                  </button>
                  <button 
                    onClick={downloadMarkdown}
                    className="w-full py-3.5 rounded-full bg-gradient-to-r from-primary to-primary-container text-on-primary-container text-xs font-bold flex items-center justify-center gap-2 shadow-[0_4px_20px_rgba(147,51,234,0.4)] hover:shadow-[0_0_30px_rgba(147,51,234,0.6)] hover:scale-[1.01] transition-all relative overflow-hidden group"
                  >
                    <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-700 blur-xl"></div>
                    <Download className="w-4 h-4" />
                    Export Markdown Notes
                  </button>
                </div>
              </div>

            </div>
          )}
        </aside>

      </main>
    </div>
  );
}
