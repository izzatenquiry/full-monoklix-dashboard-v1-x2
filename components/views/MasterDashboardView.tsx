
import React, { useState, useCallback } from 'react';
import { ActivityIcon, AlertTriangleIcon, DownloadIcon, XIcon, ImageIcon, RefreshCwIcon, VideoIcon } from '../Icons';
import Spinner from '../common/Spinner';
import ImageUpload from '../common/ImageUpload';
import { type User, type Language } from '../../types';
import { cropImageToAspectRatio } from '../../services/imageService';

// --- CONFIG ---
const SERVERS = Array.from({ length: 10 }, (_, i) => ({
    id: `s${i + 1}`,
    name: `Server S${i + 1}`,
    url: `https://s${i + 1}.monoklix.com`
}));

type TestType = 'T2I' | 'I2I' | 'I2V';
type Status = 'idle' | 'uploading' | 'running' | 'success' | 'failed';

interface ServerState {
    status: Status;
    logs: string[];
    resultType?: 'image' | 'video';
    resultUrl?: string; // Base64 for image, URL for video
    error?: string;
    mediaId?: string; // For multi-step processes
    duration?: string;
}

interface MasterDashboardViewProps {
    currentUser: User;
    language: Language;
}

const PRESET_PROMPTS = {
    'English': "A cinematic shot of a futuristic city with flying cars at sunset, cyberpunk aesthetic, highly detailed, 8k resolution.",
    'Bahasa Malaysia': "Paparan sinematik bandar futuristik dengan kereta terbang pada waktu matahari terbenam, estetik cyberpunk, sangat terperinci, resolusi 8k."
};

// Helper to safely parse JSON
const safeJson = async (res: Response) => {
    try {
        return await res.json();
    } catch {
        return { error: { message: await res.text() } };
    }
};

// Helper to download base64 or URL
const downloadContent = (url: string, type: 'image' | 'video', filenamePrefix: string) => {
    const link = document.createElement('a');
    link.href = type === 'image' && !url.startsWith('http') ? `data:image/png;base64,${url}` : url;
    link.download = `${filenamePrefix}-${Date.now()}.${type === 'image' ? 'png' : 'mp4'}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

const MasterDashboardView: React.FC<MasterDashboardViewProps> = ({ currentUser, language }) => {
    const [promptLanguage, setPromptLanguage] = useState<'English' | 'Bahasa Malaysia'>('English');
    const [prompt, setPrompt] = useState(PRESET_PROMPTS['English']);
    
    const [referenceImages, setReferenceImages] = useState<({ base64: string, mimeType: string } | null)[]>([null, null]);
    const [uploadKeys, setUploadKeys] = useState([Date.now(), Date.now() + 1]);
    const [previewItem, setPreviewItem] = useState<{ type: 'image' | 'video', url: string } | null>(null);
    
    // Initialize state for all 10 servers
    const [serverStates, setServerStates] = useState<Record<string, ServerState>>(
        SERVERS.reduce((acc, server) => ({ ...acc, [server.id]: { status: 'idle', logs: [] } }), {})
    );

    const updateServerState = (serverId: string, updates: Partial<ServerState>) => {
        setServerStates(prev => ({
            ...prev,
            [serverId]: { ...prev[serverId], ...updates }
        }));
    };

    const appendLog = (serverId: string, message: string) => {
        setServerStates(prev => ({
            ...prev,
            [serverId]: { 
                ...prev[serverId], 
                logs: [...prev[serverId].logs, `[${new Date().toLocaleTimeString()}] ${message}`] 
            }
        }));
    };

    const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const lang = e.target.value as 'English' | 'Bahasa Malaysia';
        setPromptLanguage(lang);
        setPrompt(PRESET_PROMPTS[lang]);
    };

    const handleImageUpdate = (index: number, data: { base64: string, mimeType: string } | null) => {
        setReferenceImages(prev => {
            const newImages = [...prev];
            newImages[index] = data;
            return newImages;
        });
    };

    const runTestForServer = async (server: typeof SERVERS[0], type: TestType) => {
        // Reset state
        updateServerState(server.id, { status: 'running', logs: [], resultUrl: undefined, error: undefined, duration: undefined });
        appendLog(server.id, `Starting ${type} test on ${server.url}...`);
        
        const startTime = Date.now();
        
        // Generate a random seed for THIS specific request to ensure unique output
        const randomSeed = Math.floor(Math.random() * 2147483647);
        appendLog(server.id, `Random Seed: ${randomSeed}`);

        const authToken = currentUser.personalAuthToken;
        if (!authToken) {
            updateServerState(server.id, { status: 'failed', error: 'No Auth Token' });
            appendLog(server.id, 'Error: No Personal Auth Token found.');
            return;
        }

        try {
            // --- T2I Test ---
            if (type === 'T2I') {
                appendLog(server.id, 'Sending generate request (Imagen)...');
                const payload = {
                    prompt: prompt,
                    seed: randomSeed, // Inject random seed
                    imageModelSettings: { imageModel: 'IMAGEN_3_5', aspectRatio: 'IMAGE_ASPECT_RATIO_PORTRAIT' }
                };
                
                const res = await fetch(`${server.url}/api/imagen/generate`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
                    body: JSON.stringify(payload)
                });

                const data = await safeJson(res);
                if (!res.ok) throw new Error(data.error?.message || data.message || 'Fetch failed');

                const imageBase64 = data.imagePanels?.[0]?.generatedImages?.[0]?.encodedImage;
                if (!imageBase64) throw new Error('No image returned');

                const duration = ((Date.now() - startTime) / 1000).toFixed(2) + 's';
                updateServerState(server.id, { status: 'success', resultType: 'image', resultUrl: imageBase64, duration });
                appendLog(server.id, 'Success: Image generated.');
            }

            // --- I2I Test ---
            else if (type === 'I2I') {
                const validImages = referenceImages.filter((img): img is { base64: string, mimeType: string } => img !== null);
                if (validImages.length === 0) throw new Error('No reference image provided');
                
                updateServerState(server.id, { status: 'uploading' });
                const mediaIds: string[] = [];

                // Step 1: Upload All Images
                for (let i = 0; i < validImages.length; i++) {
                    const img = validImages[i];
                    appendLog(server.id, `Uploading image ${i + 1}/${validImages.length}...`);
                    
                    const uploadRes = await fetch(`${server.url}/api/imagen/upload`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
                        body: JSON.stringify({
                             imageInput: { rawImageBytes: img.base64, mimeType: img.mimeType }
                        })
                    });
                    const uploadData = await safeJson(uploadRes);
                    if (!uploadRes.ok) throw new Error(uploadData.error?.message || `Upload failed for image ${i + 1}`);
                    
                    const mediaId = uploadData.result?.data?.json?.result?.uploadMediaGenerationId || uploadData.mediaGenerationId?.mediaGenerationId || uploadData.mediaId;
                    mediaIds.push(mediaId);
                    appendLog(server.id, `Image ${i + 1} uploaded. ID: ${mediaId}`);
                }

                // Step 2: Run Recipe with Multiple Inputs
                updateServerState(server.id, { status: 'running' });
                appendLog(server.id, 'Running edit recipe...');
                
                const recipeMediaInputs = mediaIds.map(id => ({
                     mediaInput: { mediaCategory: 'MEDIA_CATEGORY_SUBJECT', mediaGenerationId: id },
                     caption: 'reference'
                }));

                const recipeRes = await fetch(`${server.url}/api/imagen/run-recipe`, {
                     method: 'POST',
                     headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
                     body: JSON.stringify({
                         userInstruction: prompt,
                         seed: randomSeed, // Inject random seed
                         imageModelSettings: { imageModel: 'R2I', aspectRatio: 'IMAGE_ASPECT_RATIO_PORTRAIT' },
                         recipeMediaInputs: recipeMediaInputs
                     })
                });
                const recipeData = await safeJson(recipeRes);
                if (!recipeRes.ok) throw new Error(recipeData.error?.message || 'Recipe failed');
                
                const imageBase64 = recipeData.imagePanels?.[0]?.generatedImages?.[0]?.encodedImage;
                if (!imageBase64) throw new Error('No image returned');

                const duration = ((Date.now() - startTime) / 1000).toFixed(2) + 's';
                updateServerState(server.id, { status: 'success', resultType: 'image', resultUrl: imageBase64, duration });
                appendLog(server.id, 'Success: Image edited.');
            }

            // --- I2V Test ---
            else if (type === 'I2V') {
                // Veo typically takes one start image. We pick the first valid one.
                const validImage = referenceImages[0] || referenceImages[1];
                if (!validImage) throw new Error('No reference image provided');

                // Step 0: Crop to 9:16 for Veo Portrait
                appendLog(server.id, 'Cropping image to 9:16...');
                let croppedBase64 = validImage.base64;
                try {
                    croppedBase64 = await cropImageToAspectRatio(validImage.base64, '9:16');
                } catch (cropError) {
                    appendLog(server.id, 'Cropping failed, using original image.');
                    console.error(cropError);
                }

                // Step 1: Upload to Veo
                updateServerState(server.id, { status: 'uploading' });
                appendLog(server.id, 'Uploading image to Veo...');
                
                const uploadRes = await fetch(`${server.url}/api/veo/upload`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
                    body: JSON.stringify({
                         imageInput: { 
                             rawImageBytes: croppedBase64, 
                             mimeType: validImage.mimeType,
                             isUserUploaded: true,
                             aspectRatio: 'IMAGE_ASPECT_RATIO_PORTRAIT'
                         }
                    })
                });
                const uploadData = await safeJson(uploadRes);
                if (!uploadRes.ok) throw new Error(uploadData.error?.message || 'Upload failed');
                
                const mediaId = uploadData.mediaGenerationId?.mediaGenerationId || uploadData.mediaId;
                appendLog(server.id, `Upload success. Media ID: ${mediaId}`);

                // Step 2: Generate
                updateServerState(server.id, { status: 'running' });
                appendLog(server.id, 'Starting generation...');

                const genRes = await fetch(`${server.url}/api/veo/generate-i2v`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
                    body: JSON.stringify({
                         requests: [{
                             aspectRatio: 'VIDEO_ASPECT_RATIO_PORTRAIT',
                             textInput: { prompt },
                             seed: randomSeed, // Inject random seed
                             videoModelKey: 'veo_3_1_i2v_s_fast_portrait_ultra',
                             startImage: { mediaId }
                         }]
                    })
                });
                const genData = await safeJson(genRes);
                if (!genRes.ok) throw new Error(genData.error?.message || 'Generation failed');
                
                let operations = genData.operations;
                if (!operations || operations.length === 0) throw new Error('No operations returned');
                
                // Step 3: Poll Status
                appendLog(server.id, 'Polling status...');
                let finalUrl = null;
                
                for (let i = 0; i < 120; i++) { // Poll for up to 10 minutes (120 * 5s)
                     await new Promise(r => setTimeout(r, 5000)); // 5s interval
                     
                     const statusRes = await fetch(`${server.url}/api/veo/status`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
                        body: JSON.stringify({ operations })
                     });
                     const statusData = await safeJson(statusRes);
                     if (!statusRes.ok) {
                         appendLog(server.id, `Status check failed: ${statusRes.status}`);
                         continue;
                     }
                     
                     operations = statusData.operations;
                     const op = operations[0];
                     const isSuccess = op.done || ['MEDIA_GENERATION_STATUS_COMPLETED', 'MEDIA_GENERATION_STATUS_SUCCESS', 'MEDIA_GENERATION_STATUS_SUCCESSFUL'].includes(op.status);

                     if (isSuccess) {
                         // Robust URL extraction based on actual server logs
                         finalUrl = op.operation?.metadata?.video?.fifeUrl
                                 || op.metadata?.video?.fifeUrl
                                 || op.result?.generatedVideo?.[0]?.fifeUrl
                                 || op.result?.generatedVideos?.[0]?.fifeUrl
                                 || op.video?.fifeUrl 
                                 || op.fifeUrl;
                         
                         if (finalUrl) break;
                         else appendLog(server.id, 'Status success but URL not found yet...');
                     }
                     if (op.error) throw new Error(op.error.message || 'Generation error');
                     
                     appendLog(server.id, `Status: ${op.status || 'Processing'}...`);
                }
                
                if (!finalUrl) throw new Error('Timeout or no URL returned');

                // Download blob via the server to handle CORS and ensure playback
                appendLog(server.id, 'Downloading video blob...');
                const blobRes = await fetch(`${server.url}/api/veo/download-video?url=${encodeURIComponent(finalUrl)}`);
                if (!blobRes.ok) throw new Error('Failed to download video blob');
                const blob = await blobRes.blob();
                const objectUrl = URL.createObjectURL(blob);
                
                const duration = ((Date.now() - startTime) / 1000).toFixed(2) + 's';
                updateServerState(server.id, { status: 'success', resultType: 'video', resultUrl: objectUrl, duration });
                appendLog(server.id, 'Success: Video generated and downloaded.');
            }

        } catch (e: any) {
            console.error(e);
            const duration = ((Date.now() - startTime) / 1000).toFixed(2) + 's';
            updateServerState(server.id, { status: 'failed', error: e.message, duration });
            appendLog(server.id, `Error: ${e.message}`);
        }
    };

    const handleRunAll = (type: TestType) => {
        SERVERS.forEach(server => runTestForServer(server, type));
    };

    const hasRefImages = referenceImages.some(img => img !== null);

    return (
        <div className="h-full flex flex-col space-y-6">
             {/* Simple Fullscreen Preview Modal */}
             {previewItem && (
                <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4" onClick={() => setPreviewItem(null)}>
                    <button className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white" onClick={() => setPreviewItem(null)}>
                        <XIcon className="w-6 h-6" />
                    </button>
                    <div className="max-w-5xl max-h-full flex flex-col items-center" onClick={e => e.stopPropagation()}>
                        {previewItem.type === 'image' ? (
                            <img src={`data:image/png;base64,${previewItem.url}`} alt="Preview" className="max-w-full max-h-[80vh] object-contain rounded-md" />
                        ) : (
                            <video src={previewItem.url} controls autoPlay className="max-w-full max-h-[80vh] rounded-md" />
                        )}
                        <div className="mt-4">
                             <button 
                                onClick={() => downloadContent(previewItem.url, previewItem.type, 'monoklix-test')}
                                className="flex items-center gap-2 bg-white text-black font-bold py-2 px-6 rounded-full hover:bg-neutral-200 transition-colors"
                            >
                                <DownloadIcon className="w-5 h-5" /> Download Result
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex flex-col gap-2">
                <h1 className="text-2xl font-bold flex items-center gap-2 text-neutral-900 dark:text-white">
                    <ActivityIcon className="w-8 h-8 text-primary-500" />
                    Master Dashboard <span className="text-sm font-normal text-neutral-500 bg-neutral-100 dark:bg-neutral-800 px-2 py-1 rounded">Admin Only</span>
                </h1>
                <p className="text-neutral-500 dark:text-neutral-400">Monitor and test connectivity for all backend servers simultaneously.</p>
            </div>

            {/* Control Panel */}
            <div className="bg-white dark:bg-neutral-900 p-6 rounded-xl shadow-sm border border-neutral-200 dark:border-neutral-800">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-1 flex flex-col h-full">
                        <label className="block text-sm font-medium mb-2">Reference Images (For I2I/I2V)</label>
                        <div className="flex-1 grid grid-cols-2 gap-2">
                             <div className="flex flex-col h-full">
                                <ImageUpload 
                                    id="master-upload-1" 
                                    key={uploadKeys[0]}
                                    onImageUpload={(base64, mimeType) => handleImageUpdate(0, { base64, mimeType })}
                                    onRemove={() => handleImageUpdate(0, null)}
                                    language={language}
                                    title="Ref Image 1 (Primary)"
                                />
                             </div>
                             <div className="flex flex-col h-full">
                                <ImageUpload 
                                    id="master-upload-2" 
                                    key={uploadKeys[1]}
                                    onImageUpload={(base64, mimeType) => handleImageUpdate(1, { base64, mimeType })}
                                    onRemove={() => handleImageUpdate(1, null)}
                                    language={language}
                                    title="Ref Image 2"
                                />
                             </div>
                        </div>
                    </div>
                    <div className="lg:col-span-2 space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">Prompt Language</label>
                                <select 
                                    value={promptLanguage} 
                                    onChange={handleLanguageChange}
                                    className="w-full p-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
                                >
                                    <option value="English">English</option>
                                    <option value="Bahasa Malaysia">Bahasa Malaysia</option>
                                </select>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Test Prompt</label>
                            <textarea 
                                value={prompt} 
                                onChange={e => setPrompt(e.target.value)} 
                                rows={3}
                                className="w-full p-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none resize-none"
                            />
                        </div>
                        <div className="flex gap-4">
                            <button onClick={() => handleRunAll('T2I')} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg transition-colors shadow-md flex items-center justify-center gap-2">
                                <ImageIcon className="w-5 h-5" /> Test T2I (All)
                            </button>
                            <button onClick={() => handleRunAll('I2I')} disabled={!hasRefImages} className="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-4 rounded-lg transition-colors shadow-md flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                                <RefreshCwIcon className="w-5 h-5" /> Test I2I (All)
                            </button>
                            <button onClick={() => handleRunAll('I2V')} disabled={!hasRefImages} className="flex-1 bg-pink-600 hover:bg-pink-700 text-white font-bold py-3 px-4 rounded-lg transition-colors shadow-md flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                                <VideoIcon className="w-5 h-5" /> Test I2V (All)
                            </button>
                        </div>
                        <div className="text-xs text-neutral-500 mt-2 bg-neutral-100 dark:bg-neutral-800 p-2 rounded">
                            <p><strong>Note:</strong> I2I will use ALL uploaded images (composition). I2V will use the FIRST available image (animation).</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Server Grid */}
            <div className="flex-1 overflow-y-auto p-1">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                    {SERVERS.map(server => {
                        const state = serverStates[server.id];
                        return (
                            <div key={server.id} className="bg-white dark:bg-neutral-900 rounded-lg border border-neutral-200 dark:border-neutral-800 shadow-sm overflow-hidden flex flex-col h-auto">
                                {/* Header */}
                                <div className="p-3 border-b border-neutral-200 dark:border-neutral-800 flex justify-between items-center bg-neutral-50 dark:bg-neutral-800/50">
                                    <div>
                                        <h3 className="font-bold text-sm">{server.name}</h3>
                                        <p className="text-xs text-neutral-500 font-mono">{server.url}</p>
                                    </div>
                                    <StatusBadge status={state.status} />
                                </div>

                                {/* Result Area - 9:16 Aspect Ratio */}
                                <div className="relative w-full aspect-[9/16] bg-neutral-100 dark:bg-neutral-950 flex items-center justify-center group border-b border-neutral-200 dark:border-neutral-800">
                                    {state.status === 'running' || state.status === 'uploading' ? (
                                        <div className="text-center">
                                            <Spinner />
                                            <p className="text-xs mt-2 text-neutral-500 animate-pulse">{state.status}...</p>
                                        </div>
                                    ) : state.resultUrl ? (
                                        <>
                                            {state.resultType === 'video' ? (
                                                <video src={state.resultUrl} controls autoPlay muted loop className="w-full h-full object-cover" />
                                            ) : (
                                                <img src={`data:image/png;base64,${state.resultUrl}`} alt="Result" className="w-full h-full object-cover" />
                                            )}
                                            
                                            {/* Hover Overlay for Zoom/Save */}
                                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                                                <button 
                                                    onClick={() => setPreviewItem({ type: state.resultType || 'image', url: state.resultUrl! })}
                                                    className="p-2 bg-white text-black rounded-full hover:bg-neutral-200"
                                                    title="Expand"
                                                >
                                                    <ImageIcon className="w-5 h-5" />
                                                </button>
                                                <button 
                                                    onClick={() => downloadContent(state.resultUrl!, state.resultType || 'image', `server-${server.id}`)}
                                                    className="p-2 bg-white text-black rounded-full hover:bg-neutral-200"
                                                    title="Save"
                                                >
                                                    <DownloadIcon className="w-5 h-5" />
                                                </button>
                                            </div>
                                        </>
                                    ) : state.error ? (
                                        <div className="text-center p-4">
                                            <AlertTriangleIcon className="w-8 h-8 text-red-500 mx-auto mb-2" />
                                            <p className="text-xs text-red-600 break-words line-clamp-3">{state.error}</p>
                                        </div>
                                    ) : (
                                        <div className="text-neutral-400 text-xs">Ready</div>
                                    )}
                                </div>
                                
                                {/* Time & Actions Bar */}
                                <div className="flex items-center justify-between px-2 py-1.5 bg-neutral-50 dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800">
                                    <span className="text-[10px] font-mono text-neutral-500">
                                        Time: {state.duration || '--'}
                                    </span>
                                    <div className="flex gap-2">
                                        <button 
                                            onClick={() => runTestForServer(server, 'T2I')} 
                                            className="text-[10px] font-semibold text-blue-600 hover:underline"
                                            title="Retry Text-to-Image"
                                        >
                                            T2I
                                        </button>
                                        <button 
                                            onClick={() => runTestForServer(server, 'I2I')} 
                                            disabled={!referenceImages.some(img => img !== null)}
                                            className="text-[10px] font-semibold text-purple-600 hover:underline disabled:opacity-50"
                                            title="Retry Image-to-Image"
                                        >
                                            I2I
                                        </button>
                                        <button 
                                            onClick={() => runTestForServer(server, 'I2V')} 
                                            disabled={!referenceImages.some(img => img !== null)}
                                            className="text-[10px] font-semibold text-pink-600 hover:underline disabled:opacity-50"
                                            title="Retry Image-to-Video"
                                        >
                                            I2V
                                        </button>
                                    </div>
                                </div>

                                {/* Console Log */}
                                <div className="h-24 bg-black text-green-400 p-2 font-mono text-[10px] overflow-y-auto">
                                    {state.logs.length === 0 ? <span className="opacity-50">Waiting for logs...</span> : state.logs.map((log, i) => (
                                        <div key={i}>{log}</div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

const StatusBadge: React.FC<{ status: Status }> = ({ status }) => {
    const colors = {
        idle: 'bg-neutral-200 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300',
        uploading: 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300',
        running: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300',
        success: 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300',
        failed: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300',
    };
    return (
        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${colors[status]}`}>
            {status}
        </span>
    );
};

export default MasterDashboardView;
