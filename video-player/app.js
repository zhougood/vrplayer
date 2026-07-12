(() => {
  // ─── DOM Elements ───
  const logo = document.getElementById('logo');
  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('fileInput');
  const browseBtn = document.getElementById('browseBtn');
  const playerContainer = document.getElementById('playerContainer');
  const video = document.getElementById('videoPlayer');
  const vrCanvasContainer = document.getElementById('vrCanvas');
  const dragHint = document.getElementById('dragHint');
  const playPauseIndicator = document.getElementById('playPauseIndicator');
  const indicatorPlay = document.getElementById('indicatorPlay');
  const indicatorPause = document.getElementById('indicatorPause');
  const playPauseBtn = document.getElementById('playPauseBtn');
  const playIcon = document.getElementById('playIcon');
  const pauseIcon = document.getElementById('pauseIcon');
  const progressContainer = document.getElementById('progressContainer');
  const progressBuffered = document.getElementById('progressBuffered');
  const progressFilled = document.getElementById('progressFilled');
  const progressThumb = document.getElementById('progressThumb');
  const progressTooltip = document.getElementById('progressTooltip');
  const timeDisplay = document.getElementById('timeDisplay');
  const volumeBtn = document.getElementById('volumeBtn');
  const volumeHighIcon = document.getElementById('volumeHighIcon');
  const volumeMuteIcon = document.getElementById('volumeMuteIcon');
  const volumeSlider = document.getElementById('volumeSlider');
  const fullscreenBtn = document.getElementById('fullscreenBtn');
  const expandIcon = document.getElementById('expandIcon');
  const shrinkIcon = document.getElementById('shrinkIcon');
  const resetViewBtn = document.getElementById('resetViewBtn');
  const changeVideoBtn = document.getElementById('changeVideoBtn');
  const videoName = document.getElementById('videoName');
  const playerWrapper = document.getElementById('playerWrapper');
  const videoUrlInput = document.getElementById('videoUrlInput');
  const playUrlBtn = document.getElementById('playUrlBtn');
  const backToLibraryBtn = document.getElementById('backToLibraryBtn');
  const historyList = document.getElementById('historyList');
  const emptyHistory = document.getElementById('emptyHistory');
  const clearHistoryBtn = document.getElementById('clearHistoryBtn');

  const HISTORY_STORAGE_KEY = 'vr-video-player-history';
  const MAX_HISTORY_ITEMS = 12;
  const sessionHistory = new Map();

  // ─── Three.js State ───
  let scene, camera, renderer, videoTexture, videoTextureRight;
  let sphereLeft, sphereRight;
  let lon = 0, lat = 0;
  let lonVelocity = 0, latVelocity = 0;
  const FRICTION = 0.92;
  const DRAG_SPEED = 0.2;
  const VR_DRAG_SPEED = 1.15;
  const VR_ZOOM_SPEED = 0.025;
  const VR_MIN_ZOOM = 0.2; // Allow pulling closer than default
  const VR_MAX_ZOOM = 3;
  const VR_DRAG_MOVE_THRESHOLD = 1.5;
  let lookTarget;
  let isInVR = false;
  let canThumbstickSeek = true;
  let isGripExiting = false;
  const vrButtonContainer = document.getElementById('vrButtonContainer');

  // ─── WebXR VR Panel & Controllers ───
  let vrPanelCanvas, vrPanelCtx, vrPanelTexture, vrPanelMesh;
  let raycaster, tempMatrix;
  let controller1, controller2;
  let activeXRSession = null;
  let isVRDraggingProgress = false;
  let isVRDraggingView = false;
  let vrDraggingInputSource = null;
  let vrViewDragInputSource = null;
  let vrViewDragStartAngles = null;
  let vrViewDragStartOffset = null;
  let vrViewDragHadMovement = false;
  let suppressSelectInputSource = null;
  let vrVideoYawOffset = 0;
  let vrVideoPitchOffset = 0;
  let vrVideoZoom = 1;
  let vrPanelTimeout = null;

  const VR_PANEL_SIZE = { width: 1024, height: 256 };
  const VR_PROGRESS = { x: 390, y: 140, width: 430, height: 12, hitPaddingX: 24, hitPaddingY: 24 };
  const VR_BUTTONS = {
    play: { x: 80, y: 128, radius: 45 },
    rewind: { x: 190, y: 128, radius: 35 },
    forward: { x: 300, y: 128, radius: 35 },
    exit: { x: 920, y: 128, radius: 40 }
  };

  // ─── Interaction State ───
  let isDragging = false;
  let dragStart = { x: 0, y: 0 };
  let pointerDownPos = null;
  let controlsTimeout;
  let isSeeking = false;

  // ═══════════════════════════════════════════════════
  //  WEB PAGE CONTROL
  // ═══════════════════════════════════════════════════
  
  logo.addEventListener('click', returnToLibrary);


  // ═══════════════════════════════════════════════════
  //  FILE SELECTION
  // ═══════════════════════════════════════════════════

  browseBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    fileInput.click();
  });

  dropZone.addEventListener('click', () => fileInput.click());

  // Prevent clicking inside the URL input container from triggering the file picker
  const urlInputContainer = document.querySelector('.url-input-container');
  if (urlInputContainer) {
    urlInputContainer.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  }

  playUrlBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const url = videoUrlInput.value.trim();
    if (url) {
      playVideoSource(url, getVideoName(url));
    }
  });

  videoUrlInput.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      const url = videoUrlInput.value.trim();
      if (url) {
        playVideoSource(url, getVideoName(url));
      }
    }
  });


  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      const file = e.target.files[0];
      const url = URL.createObjectURL(file);
      playVideoSource(url, file.name);
    }
  });

  // Drag and drop on the drop zone
  ['dragenter', 'dragover'].forEach((evt) =>
    dropZone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropZone.classList.add('drag-over');
    })
  );

  ['dragleave', 'drop'].forEach((evt) =>
    dropZone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
    })
  );

  dropZone.addEventListener('drop', (e) => {
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('video/')) {
      const url = URL.createObjectURL(file);
      playVideoSource(url, file.name);
    }
  });

  // Allow drop anywhere when player is visible
  document.addEventListener('dragover', (e) => e.preventDefault());
  document.addEventListener('drop', (e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files[0];
    if (file && file.type.startsWith('video/')) {
      const url = URL.createObjectURL(file);
      playVideoSource(url, file.name);
    }
  });

  changeVideoBtn.addEventListener('click', () => {
    fileInput.value = '';
    fileInput.click();
  });

  backToLibraryBtn.addEventListener('click', returnToLibrary);

  historyList.addEventListener('click', (e) => {
    const historyButton = e.target.closest('[data-history-id]');
    if (!historyButton) return;

    e.stopPropagation();
    const item = sessionHistory.get(historyButton.dataset.historyId);
    if (item) playVideoSource(item.url, item.name);
  });

  clearHistoryBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    sessionHistory.clear();
    try {
      localStorage.removeItem(HISTORY_STORAGE_KEY);
    } catch {
      // Playback history remains available for this session when storage is disabled.
    }
    renderHistory();
  });

  // ═══════════════════════════════════════════════════
  //  LOAD VIDEO SOURCE
  // ═══════════════════════════════════════════════════

  function playVideoSource(url, name) {
    // Clean up error if displayed in vrCanvasContainer previously
    if (vrCanvasContainer.querySelector('h3') || vrCanvasContainer.querySelector('p')) {
      vrCanvasContainer.innerHTML = '';
      if (renderer) {
        vrCanvasContainer.appendChild(renderer.domElement);
      }
    }

    if (url.startsWith('http://') || url.startsWith('https://')) {
      video.crossOrigin = 'anonymous';
    } else {
      video.removeAttribute('crossOrigin');
    }

    video.src = url;
    const displayName = name || getVideoName(url);
    videoName.textContent = displayName;
    dropZone.classList.add('hidden');
    playerContainer.classList.remove('hidden');
    addToHistory(url, displayName);

    // Reset view direction
    lon = 0;
    lat = 0;
    lonVelocity = 0;
    latVelocity = 0;
    vrVideoYawOffset = 0;
    vrVideoPitchOffset = 0;
    vrVideoZoom = 1;
    applyVideoSphereOrientation();
    applyVideoTextureView();

    // Wait for video to have decoded frames before creating texture
    video.addEventListener('loadeddata', () => {
      if (!renderer) {
        initThreeJS();
      } else {
        // Recreate textures for new video
        videoTexture.dispose();
        if (videoTextureRight) videoTextureRight.dispose();

        videoTexture = createVideoTexture(0);     // Left eye (left half)
        videoTextureRight = createVideoTexture(0.5); // Right eye (right half)

        sphereLeft.material.map = videoTexture;
        sphereLeft.material.needsUpdate = true;
        sphereRight.material.map = videoTextureRight;
        sphereRight.material.needsUpdate = true;

        camera.fov = 75;
        camera.updateProjectionMatrix();
      }
      showDragHint();
    }, { once: true });

    video.play().catch(() => {});
  }

  function returnToLibrary() {
    video.pause();
    if (activeXRSession) activeXRSession.end().catch(() => {});
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      (document.exitFullscreen?.() || document.webkitExitFullscreen?.()).catch?.(() => {});
    }
    playerContainer.classList.add('hidden');
    dropZone.classList.remove('hidden');
    renderHistory();
  }

  function getVideoName(url) {
    const lastPathPart = url.split('/').pop()?.split('?')[0];
    try {
      return decodeURIComponent(lastPathPart || 'Remote Video');
    } catch {
      return lastPathPart || 'Remote Video';
    }
  }

  function addToHistory(url, name) {
    const isLocal = url.startsWith('blob:');
    const id = `${isLocal ? 'local' : 'url'}:${url}`;
    sessionHistory.delete(id);
    sessionHistory.set(id, { id, url, name, isLocal, playedAt: Date.now() });

    if (!isLocal) {
      const stored = getStoredHistory().filter((item) => item.id !== id);
      stored.unshift({ id, url, name, isLocal: false, playedAt: Date.now() });
      try {
        localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(stored.slice(0, MAX_HISTORY_ITEMS)));
      } catch {
        // Storage can be unavailable in private or restricted browser contexts.
      }
    }
    renderHistory();
  }

  function getStoredHistory() {
    try {
      const stored = JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY) || '[]');
      return Array.isArray(stored)
        ? stored.filter((item) => item?.id && item.url && item.name).map((item) => ({ ...item, playedAt: Number(item.playedAt) || 0 }))
        : [];
    } catch {
      return [];
    }
  }

  function renderHistory() {
    const storedItems = getStoredHistory();
    storedItems.forEach((item) => {
      if (!sessionHistory.has(item.id)) sessionHistory.set(item.id, item);
    });
    const items = [...sessionHistory.values()]
      .sort((a, b) => b.playedAt - a.playedAt)
      .slice(0, MAX_HISTORY_ITEMS);

    historyList.innerHTML = items.map((item) => `
      <li>
        <button class="history-item" type="button" data-history-id="${escapeHtml(item.id)}" title="Play ${escapeHtml(item.name)}">
          <span class="history-play-icon" aria-hidden="true">▶</span>
          <span class="history-item-name">${escapeHtml(item.name)}</span>
          <span class="history-item-source">${item.isLocal ? 'This session' : 'URL'}</span>
        </button>
      </li>
    `).join('');
    emptyHistory.classList.toggle('hidden', items.length > 0);
    clearHistoryBtn.classList.toggle('hidden', items.length === 0);
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
  }

  // ═══════════════════════════════════════════════════
  //  VIDEO TEXTURE HELPER
  // ═══════════════════════════════════════════════════

  function createVideoTexture(offsetX) {
    const tex = new THREE.VideoTexture(video);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    if (THREE.SRGBColorSpace) {
      tex.colorSpace = THREE.SRGBColorSpace;
    } else if (THREE.sRGBEncoding) {
      tex.encoding = THREE.sRGBEncoding;
    }
    tex.userData.sbsOffsetX = offsetX;
    applyVideoTextureView(tex);
    return tex;
  }

  function applyVideoTextureView(texture = null) {
    const textures = texture ? [texture] : [videoTexture, videoTextureRight].filter(Boolean);
    const zoom = Math.max(VR_MIN_ZOOM, Math.min(VR_MAX_ZOOM, isInVR ? vrVideoZoom : 1));
    
    // Instead of scaling the sphere or changing texture repeat, we TRANSLATE the sphere along the Z-axis.
    // Moving the sphere further away (negative Z offset) decreases its angular FOV, acting as a "zoom out" and moving it away.
    // Moving it closer (positive Z offset) increases its angular FOV, acting as a "zoom in" and pulling it closer to the face.
    const radius = 500;
    const zOffset = -radius * (zoom - 1);
    
    if (typeof sphereLeft !== 'undefined' && sphereLeft) {
      sphereLeft.scale.set(1, 1, 1);
      sphereLeft.position.set(0, 0, zOffset);
    }
    if (typeof sphereRight !== 'undefined' && sphereRight) {
      sphereRight.scale.set(1, 1, 1);
      sphereRight.position.set(0, 0, zOffset);
    }

    textures.forEach((tex) => {
      const sbsOffsetX = tex.userData.sbsOffsetX || 0;
      // Keep texture mapping full to avoid distortion
      tex.repeat.set(0.5, 1);
      tex.offset.set(sbsOffsetX, 0);
      tex.needsUpdate = true;
    });
  }

  // ═══════════════════════════════════════════════════
  //  THREE.JS INITIALIZATION
  // ═══════════════════════════════════════════════════

  function initThreeJS() {
    try {
      let w = vrCanvasContainer.clientWidth;
      let h = vrCanvasContainer.clientHeight;

      // Fallback if container hasn't laid out yet
      if (w === 0 || h === 0) {
        w = playerWrapper.clientWidth || 800;
        h = playerWrapper.clientHeight || 450;
      }

      // Scene — dark gray background so we can tell if rendering works
      scene = new THREE.Scene();
      scene.background = new THREE.Color(0x111118);

      // Camera — 75° FOV for a comfortable default view
      camera = new THREE.PerspectiveCamera(75, w / h, 0.1, 5000);
      camera.position.set(0, 0, 0);

      // Initialize lookTarget
      lookTarget = new THREE.Vector3();

      // Renderer
      renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setSize(w, h);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      vrCanvasContainer.appendChild(renderer.domElement);

      // ─── WebXR Setup ───
      renderer.xr.enabled = true;

      // Initialize Raycasting
      raycaster = new THREE.Raycaster();
      tempMatrix = new THREE.Matrix4();

      // ─── WebXR VR Panel ───
      vrPanelCanvas = document.createElement('canvas');
      vrPanelCanvas.width = 1024;
      vrPanelCanvas.height = 256;
      vrPanelCtx = vrPanelCanvas.getContext('2d');
      vrPanelTexture = new THREE.CanvasTexture(vrPanelCanvas);

      const panelGeom = new THREE.PlaneGeometry(1.2, 0.3);
      const panelMat = new THREE.MeshBasicMaterial({ map: vrPanelTexture, transparent: true, side: THREE.DoubleSide });
      vrPanelMesh = new THREE.Mesh(panelGeom, panelMat);
      vrPanelMesh.position.set(0, -0.35, -1.8);
      vrPanelMesh.rotation.x = -Math.PI / 12;
      scene.add(vrPanelMesh);
      vrPanelMesh.visible = false; // Hidden on desktop

      // ─── VR Controllers ───
      setupVRControllers();

      // ─── Stereo SBS Rendering with Layers ───
      // Layer 0 = default (visible to both eyes on desktop)
      // Layer 1 = left eye only (in VR)
      // Layer 2 = right eye only (in VR)

      // Video Textures
      videoTexture = createVideoTexture(0);        // Left half of SBS
      videoTextureRight = createVideoTexture(0.5);  // Right half of SBS

      // Hemisphere Geometry (180°)
      const geometry = new THREE.SphereGeometry(500, 64, 48, 0, Math.PI, 0, Math.PI);
      geometry.scale(-1, 1, 1); // Flip normals so inside is visible

      // Left-eye sphere (also used for mono desktop viewing)
      const materialLeft = new THREE.MeshBasicMaterial({ map: videoTexture });
      sphereLeft = new THREE.Mesh(geometry, materialLeft);
      sphereLeft.rotation.order = 'YXZ';
      sphereLeft.rotation.y = Math.PI;
      sphereLeft.layers.set(1);  // Layer 1 = left eye
      scene.add(sphereLeft);

      // Right-eye sphere
      const materialRight = new THREE.MeshBasicMaterial({ map: videoTextureRight });
      sphereRight = new THREE.Mesh(geometry.clone(), materialRight);
      sphereRight.rotation.order = 'YXZ';
      sphereRight.rotation.y = Math.PI;
      sphereRight.layers.set(2);  // Layer 2 = right eye
      scene.add(sphereRight);
      applyVideoSphereOrientation();

      // Camera sees layer 0 + layer 1 by default (mono desktop = left eye)
      camera.layers.enable(1);

      // Set up interaction
      setupDragControls();
      setupResizeObserver();

      // ─── VR Button ───
      setupVRButton();

      // Start render loop using setAnimationLoop (required for WebXR)
      renderer.setAnimationLoop(animate);

      console.log('Three.js initialized with WebXR support. Canvas size:', w, 'x', h);
      console.log('Video readyState:', video.readyState, 'videoWidth:', video.videoWidth);
    } catch (err) {
      console.error('Three.js init failed:', err);
      vrCanvasContainer.innerHTML = '<div style="color:#ff6b6b;padding:40px;text-align:center;font-family:monospace;">'
        + '<p>⚠️ Three.js Error</p><p>' + err.message + '</p></div>';
    }
  }

  // ═══════════════════════════════════════════════════
  //  WEBXR VR BUTTON & PANEL
  // ═══════════════════════════════════════════════════

  function showVRPanel() {
    if (!vrPanelMesh) return;
    vrPanelMesh.visible = true;
    if (vrPanelTimeout) clearTimeout(vrPanelTimeout);
    vrPanelTimeout = setTimeout(() => {
      if (vrPanelMesh && video && !video.paused) {
        vrPanelMesh.visible = false;
      }
    }, 3000);
  }

  async function setupVRButton() {
    let supported = false;
    let xrErrorReason = '';

    if (!navigator.xr) {
      xrErrorReason = 'insecure-context'; // HTTPS or localhost required
    } else {
      try {
        supported = await navigator.xr.isSessionSupported('immersive-vr');
        if (!supported) {
          xrErrorReason = 'device-unsupported';
        }
      } catch (e) {
        console.log('XR support check failed:', e);
        xrErrorReason = 'check-failed';
      }
    }

    // Create a custom "Enter VR" button styled to match our player
    const vrBtn = document.createElement('button');
    vrBtn.id = 'enterVRBtn';
    vrBtn.title = 'Enter VR';

    if (!navigator.xr || !supported) {
      vrBtn.className = 'control-btn enter-vr-btn vr-disabled';
      vrBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.55;">
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/>
          <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
      `;
      vrButtonContainer.appendChild(vrBtn);

      vrBtn.addEventListener('click', () => {
        let alertMessage = 'WebXR Immersive VR is not available.\n\n';
        if (xrErrorReason === 'insecure-context') {
          alertMessage += 'Reason: Insecure context (HTTP).\n\nWebXR requires a secure context (HTTPS) or localhost to run.\n\nTo test on Meta Quest 3:\n1. Serve the page over HTTPS (e.g. using ngrok, localtunnel, or a self-signed certificate).\n2. Or use USB port forwarding (adb forward tcp:8080 tcp:8080) and access via http://localhost:8080 on the headset.\n3. Or enable "Unsafely treat insecure origin as secure" in chrome://flags inside the Quest Browser.';
        } else if (xrErrorReason === 'device-unsupported') {
          alertMessage += 'Reason: Your browser or device does not support immersive-vr mode.\n\nPlease open this page in Meta Quest Browser or another WebXR-compatible VR browser.';
        } else {
          alertMessage += 'Reason: WebXR detection failed or is unsupported on this browser.';
        }
        alert(alertMessage);
      });
      return;
    }

    // WebXR is supported!
    vrBtn.className = 'control-btn enter-vr-btn';
    vrBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M2 8a2 2 0 012-2h16a2 2 0 012 2v8a2 2 0 01-2 2h-4l-2-3h-4l-2 3H4a2 2 0 01-2-2V8z"/>
        <circle cx="8" cy="11" r="2"/>
        <circle cx="16" cy="11" r="2"/>
      </svg>
    `;
    vrButtonContainer.appendChild(vrBtn);

    let currentSession = null;

    vrBtn.addEventListener('click', async () => {
      if (currentSession) {
        await currentSession.end();
        return;
      }

      try {
        // Start video playback on this user gesture
        if (video.paused) {
          video.play().catch(() => {});
        }

        const session = await navigator.xr.requestSession('immersive-vr', {
          optionalFeatures: ['local-floor', 'bounded-floor']
        });

        currentSession = session;
        activeXRSession = session;
        isInVR = true;

        session.addEventListener('selectstart', (e) => {
          const panelPoint = getPanelPointForInputSource(e.inputSource);
          if (panelPoint) {
            if (isPointInProgressHitArea(panelPoint.x, panelPoint.y)) {
              isVRDraggingProgress = true;
              vrDraggingInputSource = e.inputSource;
              suppressSelectInputSource = e.inputSource;
              seekVRProgress(panelPoint.x);
              drawVRPanel();
            }
            return;
          }

          startVRViewDrag(e.inputSource);
        });

        session.addEventListener('selectend', (e) => {
          if (isVRDraggingProgress && e.inputSource === vrDraggingInputSource) {
            isVRDraggingProgress = false;
            vrDraggingInputSource = null;
          }

          if (isVRDraggingView && e.inputSource === vrViewDragInputSource) {
            if (vrViewDragHadMovement) {
              suppressSelectInputSource = e.inputSource;
            }
            stopVRViewDrag();
          }
        });

        session.addEventListener('select', (e) => {
          // A progress drag also emits a select gesture on many controllers.
          if (e.inputSource === suppressSelectInputSource) {
            suppressSelectInputSource = null;
            return;
          }

          if (e.inputSource === vrViewDragInputSource && vrViewDragHadMovement) {
            return;
          }

          if (vrPanelMesh && !vrPanelMesh.visible) {
            showVRPanel();
            return; // Just show the panel, don't trigger play/pause
          }

          const panelPoint = getPanelPointForInputSource(e.inputSource);
          if (panelPoint) {
            handlePanelClick(panelPoint.x, panelPoint.y);
            showVRPanel(); // Keep panel alive
            drawVRPanel(); // Redraw UI state immediately
            return; // Don't trigger standard play/pause toggle if we clicked the panel
          }

          // Fallback: click gesture triggers play/pause
          togglePlay();
          showVRPanel(); // Keep panel alive or show it if video pauses
        });

        session.addEventListener('end', () => {
          currentSession = null;
          activeXRSession = null;
          isInVR = false;
          isVRDraggingProgress = false;
          isVRDraggingView = false;
          vrDraggingInputSource = null;
          vrViewDragInputSource = null;
          vrViewDragStartAngles = null;
          vrViewDragStartOffset = null;
          vrViewDragHadMovement = false;
          suppressSelectInputSource = null;
          // Hide VR UI panel
          if (vrPanelTimeout) {
            clearTimeout(vrPanelTimeout);
            vrPanelTimeout = null;
          }
          if (vrPanelMesh) vrPanelMesh.visible = false;
          // Restore camera to mono desktop mode (layer 0 + 1)
          camera.layers.set(0);
          camera.layers.enable(1);
          applyVideoTextureView();
          vrBtn.classList.remove('vr-active');
          console.log('VR session ended.');
        });

        await renderer.xr.setSession(session);
        camera.layers.enable(1);
        camera.layers.enable(2);
        applyVideoSphereOrientation();
        applyVideoTextureView();
        if (vrPanelMesh) {
          // Position the panel in front of the viewer orientation upon start
          const tempEuler = new THREE.Euler(0, camera.rotation.y, 0, 'YXZ');
          vrPanelMesh.position.set(0, -0.35, -1.8).applyEuler(tempEuler);
          vrPanelMesh.rotation.set(-Math.PI / 12, camera.rotation.y, 0, 'YXZ');
          drawVRPanel();
          showVRPanel();
        }
        vrBtn.classList.add('vr-active');
        console.log('VR session started.');
      } catch (err) {
        console.error('Failed to start VR session:', err);
      }
    });
  }

  // ═══════════════════════════════════════════════════
  //  RENDER LOOP
  // ═══════════════════════════════════════════════════

  function animate() {
    // In VR mode, head tracking is handled by WebXR — skip manual look controls
    if (isInVR) {
      handleVRInput();
      updateXRCameraLayers();
      if (video && !video.paused) {
        drawVRPanel();
      }
    } else {
      // Apply momentum / inertia when not dragging
      if (!isDragging) {
        lon += lonVelocity;
        lat += latVelocity;
        lonVelocity *= FRICTION;
        latVelocity *= FRICTION;
        if (Math.abs(lonVelocity) < 0.001) lonVelocity = 0;
        if (Math.abs(latVelocity) < 0.001) latVelocity = 0;
      }

      // Clamp to hemisphere bounds
      lon = Math.max(-90, Math.min(90, lon));
      lat = Math.max(-85, Math.min(85, lat));

      // Spherical → Cartesian look target
      const phi = THREE.MathUtils.degToRad(90 - lat);
      const theta = THREE.MathUtils.degToRad(lon - 90);

      lookTarget.set(
        Math.sin(phi) * Math.cos(theta),
        Math.cos(phi),
        Math.sin(phi) * Math.sin(theta)
      );
      camera.lookAt(lookTarget);
    }

    // Update video textures
    if (videoTexture) videoTexture.needsUpdate = true;
    if (videoTextureRight) videoTextureRight.needsUpdate = true;

    renderer.render(scene, camera);
  }

  function handleVRInput() {
    const session = renderer.xr.getSession();
    if (!session) return;

    // Handle VR Progress Dragging (continuous seek during drag)
    if (isVRDraggingProgress && vrDraggingInputSource) {
      const panelPoint = getPanelPointForInputSource(vrDraggingInputSource);
      if (panelPoint) {
        seekVRProgress(panelPoint.x);
        drawVRPanel();
      }
    }

    if (isVRDraggingView && vrViewDragInputSource) {
      updateVRViewDrag();
    }

    let stickX = 0;
    let stickY = 0;
    let gripPressed = false;

    for (const source of session.inputSources) {
      if (source.gamepad) {
        const axes = source.gamepad.axes;
        const buttons = source.gamepad.buttons;

        // Thumbstick axes
        if (axes.length > 2) {
          const xVal = axes[2];
          const yVal = axes.length > 3 ? axes[3] : 0;
          if (Math.abs(xVal) > 0.4) {
            stickX = xVal;
          }
          if (Math.abs(yVal) > 0.25) {
            stickY = yVal;
          }
        } else if (axes.length > 0) {
          const xVal = axes[0];
          const yVal = axes.length > 1 ? axes[1] : 0;
          if (Math.abs(xVal) > 0.4) {
            stickX = xVal;
          }
          if (Math.abs(yVal) > 0.25) {
            stickY = yVal;
          }
        }

        // Grip button (usually index 1)
        if (buttons.length > 1 && buttons[1].pressed) {
          gripPressed = true;
        }
      }
    }

    // Handle Grip Squeeze to Exit VR
    if (gripPressed) {
      if (!isGripExiting) {
        isGripExiting = true;
        session.end().catch(() => {});
        setTimeout(() => { isGripExiting = false; }, 1000);
      }
    }

    const isHorizontalDominant = Math.abs(stickX) > Math.abs(stickY);

    // Handle Thumbstick Seek (X axis)
    if (isHorizontalDominant && Math.abs(stickX) > 0.5) {
      if (canThumbstickSeek) {
        canThumbstickSeek = false;
        const direction = stickX > 0 ? 1 : -1;
        video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + (direction * 10)));
        showVRPanel(); // Keep panel alive while seeking
        setTimeout(() => { canThumbstickSeek = true; }, 800); // 800ms debounce
      }
    } else {
      if (Math.abs(stickX) < 0.15) {
        canThumbstickSeek = true;
      }
    }

    // Handle Thumbstick Zoom (Y axis). Up zooms out, down zooms in.
    if (!isHorizontalDominant && Math.abs(stickY) > 0.25) {
      const nextZoom = Math.max(VR_MIN_ZOOM, Math.min(VR_MAX_ZOOM, vrVideoZoom - stickY * VR_ZOOM_SPEED));
      if (Math.abs(nextZoom - vrVideoZoom) > 0.0001) {
        vrVideoZoom = nextZoom;
        applyVideoTextureView();
        showVRPanel(); // Keep panel alive while zooming
      }
    }
  }

  // ═══════════════════════════════════════════════════
  //  DRAG-TO-LOOK CONTROLS
  // ═══════════════════════════════════════════════════

  function setupDragControls() {
    const canvas = renderer.domElement;

    // ── Mouse ──
    canvas.addEventListener('mousedown', (e) => {
      isDragging = true;
      dragStart = { x: e.clientX, y: e.clientY };
      pointerDownPos = { x: e.clientX, y: e.clientY };
      lonVelocity = 0;
      latVelocity = 0;
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;
      lonVelocity = -dx * DRAG_SPEED;
      latVelocity = dy * DRAG_SPEED;
      lon -= dx * DRAG_SPEED;
      lat += dy * DRAG_SPEED;
      dragStart = { x: e.clientX, y: e.clientY };
    });

    window.addEventListener('mouseup', (e) => {
      if (!isDragging) return;
      isDragging = false;

      // Detect click (no significant movement) → toggle play/pause
      if (pointerDownPos) {
        const dx = e.clientX - pointerDownPos.x;
        const dy = e.clientY - pointerDownPos.y;
        if (Math.sqrt(dx * dx + dy * dy) < 5) {
          togglePlay();
        }
        pointerDownPos = null;
      }
    });

    // ── Touch ──
    canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        isDragging = true;
        dragStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        pointerDownPos = { ...dragStart };
        lonVelocity = 0;
        latVelocity = 0;
      }
    }, { passive: true });

    canvas.addEventListener('touchmove', (e) => {
      if (!isDragging || e.touches.length !== 1) return;
      e.preventDefault();
      const dx = e.touches[0].clientX - dragStart.x;
      const dy = e.touches[0].clientY - dragStart.y;
      lonVelocity = -dx * DRAG_SPEED;
      latVelocity = dy * DRAG_SPEED;
      lon -= dx * DRAG_SPEED;
      lat += dy * DRAG_SPEED;
      dragStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }, { passive: false });

    canvas.addEventListener('touchend', (e) => {
      if (!isDragging) return;
      isDragging = false;
      // Click detection for touch
      if (pointerDownPos && e.changedTouches.length === 1) {
        const dx = e.changedTouches[0].clientX - pointerDownPos.x;
        const dy = e.changedTouches[0].clientY - pointerDownPos.y;
        if (Math.sqrt(dx * dx + dy * dy) < 10) {
          togglePlay();
        }
        pointerDownPos = null;
      }
    });

    // ── Scroll to zoom (change FOV) ──
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      camera.fov = Math.max(30, Math.min(110, camera.fov + e.deltaY * 0.05));
      camera.updateProjectionMatrix();
    }, { passive: false });

    // ── Double-click to fullscreen ──
    canvas.addEventListener('dblclick', (e) => {
      e.preventDefault();
      toggleFullscreen();
    });
  }

  // ═══════════════════════════════════════════════════
  //  RESIZE HANDLING
  // ═══════════════════════════════════════════════════

  function setupResizeObserver() {
    const ro = new ResizeObserver(() => {
      if (!renderer) return;
      const w = vrCanvasContainer.clientWidth;
      const h = vrCanvasContainer.clientHeight;
      if (w === 0 || h === 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    ro.observe(vrCanvasContainer);
  }

  // ═══════════════════════════════════════════════════
  //  DRAG HINT
  // ═══════════════════════════════════════════════════

  function showDragHint() {
    dragHint.classList.remove('hidden', 'fade-out');
    setTimeout(() => dragHint.classList.add('fade-out'), 2500);
    setTimeout(() => dragHint.classList.add('hidden'), 3300);
  }

  // ═══════════════════════════════════════════════════
  //  PLAY / PAUSE
  // ═══════════════════════════════════════════════════

  function togglePlay() {
    if (video.paused) {
      video.play().catch((err) => {
        console.warn('Video playback was blocked or failed:', err);
      });
    } else {
      video.pause();
    }
  }

  playPauseBtn.addEventListener('click', togglePlay);

  video.addEventListener('play', () => {
    playIcon.classList.add('hidden');
    pauseIcon.classList.remove('hidden');
    showIndicator(false);
  });

  video.addEventListener('pause', () => {
    playIcon.classList.remove('hidden');
    pauseIcon.classList.add('hidden');
    showIndicator(true);
  });

  function showIndicator(isPlay) {
    indicatorPlay.classList.toggle('hidden', !isPlay);
    indicatorPause.classList.toggle('hidden', isPlay);
    playPauseIndicator.classList.remove('show');
    void playPauseIndicator.offsetWidth; // Force reflow
    playPauseIndicator.classList.add('show');
  }

  // ═══════════════════════════════════════════════════
  //  PROGRESS BAR
  // ═══════════════════════════════════════════════════

  video.addEventListener('timeupdate', () => {
    if (isSeeking) return;
    updateProgress();
  });

  video.addEventListener('loadedmetadata', () => {
    updateProgress();
    updateBuffered();
    drawVRPanel();
  });

  video.addEventListener('durationchange', () => {
    updateProgress();
    drawVRPanel();
  });

  video.addEventListener('progress', updateBuffered);

  function updateProgress() {
    const pct = video.duration ? (video.currentTime / video.duration) * 100 : 0;
    progressFilled.style.width = pct + '%';
    progressThumb.style.left = pct + '%';
    timeDisplay.textContent = `${formatTime(video.currentTime)} / ${formatTime(video.duration || 0)}`;
  }

  function updateBuffered() {
    if (video.buffered.length > 0) {
      const end = video.buffered.end(video.buffered.length - 1);
      const pct = video.duration ? (end / video.duration) * 100 : 0;
      progressBuffered.style.width = pct + '%';
    }
  }

  // Seeking via progress bar
  progressContainer.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    isSeeking = true;
    progressContainer.setPointerCapture?.(e.pointerId);
    seekFromClientX(e.clientX);
  });

  progressContainer.addEventListener('pointermove', (e) => {
    if (!isSeeking) return;
    e.preventDefault();
    seekFromClientX(e.clientX);
  });

  progressContainer.addEventListener('pointerup', stopSeek);
  progressContainer.addEventListener('pointercancel', stopSeek);
  progressContainer.addEventListener('lostpointercapture', stopSeek);

  function seekFromClientX(clientX) {
    const rect = progressContainer.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    progressFilled.style.width = pct * 100 + '%';
    progressThumb.style.left = pct * 100 + '%';
    if (hasSeekableDuration()) {
      video.currentTime = pct * video.duration;
      timeDisplay.textContent = `${formatTime(video.currentTime)} / ${formatTime(video.duration)}`;
    }
  }

  function stopSeek() {
    if (!isSeeking) return;
    isSeeking = false;
    updateProgress();
  }

  // Tooltip on hover
  progressContainer.addEventListener('mousemove', (e) => {
    const rect = progressContainer.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const time = video.duration ? pct * video.duration : 0;
    progressTooltip.textContent = formatTime(time);
    progressTooltip.style.left = pct * 100 + '%';
  });

  // ═══════════════════════════════════════════════════
  //  VOLUME
  // ═══════════════════════════════════════════════════

  volumeSlider.addEventListener('input', () => {
    video.volume = parseFloat(volumeSlider.value);
    video.muted = false;
    updateVolumeIcon();
  });

  volumeBtn.addEventListener('click', () => {
    video.muted = !video.muted;
    updateVolumeIcon();
  });

  function updateVolumeIcon() {
    const muted = video.muted || video.volume === 0;
    volumeHighIcon.classList.toggle('hidden', muted);
    volumeMuteIcon.classList.toggle('hidden', !muted);
  }

  // ═══════════════════════════════════════════════════
  //  VIDEO ERROR HANDLING
  // ═══════════════════════════════════════════════════

  video.addEventListener('error', () => {
    const error = video.error;
    console.error('Video loading error:', error);
    let message = 'Failed to load video.';
    if (error) {
      switch (error.code) {
        case error.MEDIA_ERR_ABORTED:
          message = 'Video loading aborted.';
          break;
        case error.MEDIA_ERR_NETWORK:
          message = 'Network error occurred while loading video.';
          break;
        case error.MEDIA_ERR_DECODE:
          message = 'Video playback aborted due to a corruption problem or unsupported features.';
          break;
        case error.MEDIA_ERR_SRC_NOT_SUPPORTED:
          message = 'The video could not be loaded, either because the server or network failed or because the format is not supported.';
          if (video.src.startsWith('http') && video.crossOrigin) {
            message += '<br><br><strong style="color:#ff8b8b;">Note:</strong> This is likely due to CORS restrictions on the remote server. The server hosting the video must allow Cross-Origin Resource Sharing (CORS).';
          }
          break;
      }
    }

    // Show error inside the player container instead of black canvas
    dropZone.classList.add('hidden');
    playerContainer.classList.remove('hidden');

    vrCanvasContainer.innerHTML = `<div style="color:#ff6b6b;padding:40px;text-align:center;font-family:sans-serif;line-height:1.6;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;">`
      + `<h3 style="margin-bottom:10px;">⚠️ Video Load Error</h3>`
      + `<p style="max-width:500px;margin-bottom:20px;font-size:0.9rem;">${message}</p>`
      + `<button id="errorBackBtn" class="browse-btn" style="margin-top:0;">Go Back</button>`
      + `</div>`;

    document.getElementById('errorBackBtn')?.addEventListener('click', () => {
      returnToLibrary();
    });
  });


  // ═══════════════════════════════════════════════════
  //  FULLSCREEN
  // ═══════════════════════════════════════════════════

  fullscreenBtn.addEventListener('click', toggleFullscreen);

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      playerWrapper.requestFullscreen?.() || playerWrapper.webkitRequestFullscreen?.();
    } else {
      document.exitFullscreen?.() || document.webkitExitFullscreen?.();
    }
  }

  document.addEventListener('fullscreenchange', updateFullscreenIcons);
  document.addEventListener('webkitfullscreenchange', updateFullscreenIcons);

  function updateFullscreenIcons() {
    const isFs = !!document.fullscreenElement;
    expandIcon.classList.toggle('hidden', isFs);
    shrinkIcon.classList.toggle('hidden', !isFs);
  }

  // ═══════════════════════════════════════════════════
  //  RESET VIEW
  // ═══════════════════════════════════════════════════

  resetViewBtn.addEventListener('click', resetView);

  function resetView() {
    lon = 0;
    lat = 0;
    lonVelocity = 0;
    latVelocity = 0;
    if (camera) {
      camera.fov = 75;
      camera.updateProjectionMatrix();
    }
    vrVideoYawOffset = 0;
    vrVideoPitchOffset = 0;
    vrVideoZoom = 1;
    applyVideoSphereOrientation();
    applyVideoTextureView();
  }

  // ═══════════════════════════════════════════════════
  //  AUTO-HIDE CONTROLS
  // ═══════════════════════════════════════════════════

  playerWrapper.addEventListener('mousemove', () => {
    playerWrapper.classList.add('controls-visible');
    clearTimeout(controlsTimeout);
    controlsTimeout = setTimeout(() => {
      if (!video.paused) {
        playerWrapper.classList.remove('controls-visible');
      }
    }, 2500);
  });

  playerWrapper.addEventListener('mouseleave', () => {
    if (!video.paused) {
      playerWrapper.classList.remove('controls-visible');
    }
  });

  // ═══════════════════════════════════════════════════
  //  KEYBOARD SHORTCUTS
  // ═══════════════════════════════════════════════════

  document.addEventListener('keydown', (e) => {
    if (playerContainer.classList.contains('hidden')) return;

    switch (e.key) {
      case ' ':
      case 'k':
        e.preventDefault();
        togglePlay();
        break;
      case 'ArrowRight':
        e.preventDefault();
        video.currentTime = Math.min(video.duration, video.currentTime + 5);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        video.currentTime = Math.max(0, video.currentTime - 5);
        break;
      case 'ArrowUp':
        e.preventDefault();
        video.volume = Math.min(1, video.volume + 0.1);
        volumeSlider.value = video.volume;
        updateVolumeIcon();
        break;
      case 'ArrowDown':
        e.preventDefault();
        video.volume = Math.max(0, video.volume - 0.1);
        volumeSlider.value = video.volume;
        updateVolumeIcon();
        break;
      case 'f':
        e.preventDefault();
        toggleFullscreen();
        break;
      case 'm':
        e.preventDefault();
        video.muted = !video.muted;
        updateVolumeIcon();
        break;
      case 'r':
        e.preventDefault();
        resetView();
        break;
      case 'Escape':
        if (!document.fullscreenElement && !document.webkitFullscreenElement) {
          e.preventDefault();
          returnToLibrary();
        }
        break;
    }
  });

  // ═══════════════════════════════════════════════════
  //  HELPERS
  // ═══════════════════════════════════════════════════

  function formatTime(seconds) {
    if (isNaN(seconds)) return '0:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) {
      return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  // Check for 'video' or 'url' query parameter on page load
  const urlParams = new URLSearchParams(window.location.search);
  const videoUrl = urlParams.get('video') || urlParams.get('url');
  if (videoUrl) {
    const decodedUrl = decodeURIComponent(videoUrl);
    playVideoSource(decodedUrl, getVideoName(decodedUrl));
  }

  renderHistory();

  // ═══════════════════════════════════════════════════
  //  VR 3D PANEL DRAWING & INTERACTION
  // ═══════════════════════════════════════════════════

  function setupVRControllers() {
    controller1 = renderer.xr.getController(0);
    controller1.addEventListener('connected', (event) => {
      controller1.userData.inputSource = event.data;
    });
    controller1.addEventListener('disconnected', () => {
      controller1.userData.inputSource = null;
    });
    scene.add(controller1);

    controller2 = renderer.xr.getController(1);
    controller2.addEventListener('connected', (event) => {
      controller2.userData.inputSource = event.data;
    });
    controller2.addEventListener('disconnected', () => {
      controller2.userData.inputSource = null;
    });
    scene.add(controller2);

    const lineGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -5)
    ]);
    const lineMaterial = new THREE.LineBasicMaterial({
      color: 0x8b5cf6,
      transparent: true,
      opacity: 0.6
    });

    const line1 = new THREE.Line(lineGeometry, lineMaterial.clone());
    line1.name = 'laser';
    controller1.add(line1);

    const line2 = new THREE.Line(lineGeometry, lineMaterial.clone());
    line2.name = 'laser';
    controller2.add(line2);
  }

  function getControllerForInputSource(inputSource) {
    if (!inputSource) return null;

    if (controller1?.userData.inputSource === inputSource) return controller1;
    if (controller2?.userData.inputSource === inputSource) return controller2;

    const session = renderer.xr.getSession();
    if (session) {
      const index = Array.from(session.inputSources).indexOf(inputSource);
      if (index >= 0) {
        return renderer.xr.getController(Math.min(index, 1));
      }
    }

    return null;
  }

  function getPanelPointForInputSource(inputSource) {
    if (!vrPanelMesh || !inputSource) return null;

    const controller = getControllerForInputSource(inputSource);
    if (!controller) return null;

    tempMatrix.identity().extractRotation(controller.matrixWorld);
    raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

    const intersects = raycaster.intersectObject(vrPanelMesh);
    if (intersects.length === 0 || !intersects[0].uv) return null;

    return {
      x: intersects[0].uv.x * VR_PANEL_SIZE.width,
      y: (1 - intersects[0].uv.y) * VR_PANEL_SIZE.height
    };
  }

  function getControllerRayDirection(inputSource) {
    const controller = getControllerForInputSource(inputSource);
    if (!controller) return null;

    tempMatrix.identity().extractRotation(controller.matrixWorld);
    return new THREE.Vector3(0, 0, -1).applyMatrix4(tempMatrix).normalize();
  }

  function getRayAngles(direction) {
    return {
      yaw: THREE.MathUtils.radToDeg(Math.atan2(direction.x, -direction.z)),
      pitch: THREE.MathUtils.radToDeg(Math.asin(Math.max(-1, Math.min(1, direction.y))))
    };
  }

  function normalizeAngleDelta(degrees) {
    let delta = degrees;
    while (delta > 180) delta -= 360;
    while (delta < -180) delta += 360;
    return delta;
  }

  function startVRViewDrag(inputSource) {
    const direction = getControllerRayDirection(inputSource);
    if (!direction) return;

    isVRDraggingView = true;
    vrViewDragInputSource = inputSource;
    vrViewDragStartAngles = getRayAngles(direction);
    vrViewDragStartOffset = {
      yaw: vrVideoYawOffset,
      pitch: vrVideoPitchOffset
    };
    vrViewDragHadMovement = false;
  }

  function updateVRViewDrag() {
    const direction = getControllerRayDirection(vrViewDragInputSource);
    if (!direction || !vrViewDragStartAngles || !vrViewDragStartOffset) return;

    const angles = getRayAngles(direction);
    const deltaYaw = normalizeAngleDelta(angles.yaw - vrViewDragStartAngles.yaw);
    const deltaPitch = angles.pitch - vrViewDragStartAngles.pitch;

    vrVideoYawOffset = Math.max(-90, Math.min(90, vrViewDragStartOffset.yaw - deltaYaw * VR_DRAG_SPEED));
    vrVideoPitchOffset = Math.max(-65, Math.min(65, vrViewDragStartOffset.pitch - deltaPitch * VR_DRAG_SPEED));

    if (Math.abs(deltaYaw) > VR_DRAG_MOVE_THRESHOLD || Math.abs(deltaPitch) > VR_DRAG_MOVE_THRESHOLD) {
      vrViewDragHadMovement = true;
    }

    applyVideoSphereOrientation();
  }

  function stopVRViewDrag() {
    isVRDraggingView = false;
    vrViewDragInputSource = null;
    vrViewDragStartAngles = null;
    vrViewDragStartOffset = null;
    vrViewDragHadMovement = false;
  }

  function applyVideoSphereOrientation() {
    if (!sphereLeft || !sphereRight) return;

    const pitch = THREE.MathUtils.degToRad(vrVideoPitchOffset);
    const yaw = Math.PI + THREE.MathUtils.degToRad(vrVideoYawOffset);
    sphereLeft.rotation.set(pitch, yaw, 0, 'YXZ');
    sphereRight.rotation.set(pitch, yaw, 0, 'YXZ');
  }

  function updateXRCameraLayers() {
    const xrCamera = renderer.xr.getCamera(camera);
    if (!xrCamera?.cameras || xrCamera.cameras.length < 2) return;

    xrCamera.cameras[0].layers.set(0);
    xrCamera.cameras[0].layers.enable(1);
    xrCamera.cameras[1].layers.set(0);
    xrCamera.cameras[1].layers.enable(2);
  }

  function isPointInCircle(px, py, circle) {
    const dx = px - circle.x;
    const dy = py - circle.y;
    return dx * dx + dy * dy <= circle.radius * circle.radius;
  }

  function isPointInProgressHitArea(x, y) {
    return (
      x >= VR_PROGRESS.x - VR_PROGRESS.hitPaddingX &&
      x <= VR_PROGRESS.x + VR_PROGRESS.width + VR_PROGRESS.hitPaddingX &&
      y >= VR_PROGRESS.y - VR_PROGRESS.hitPaddingY &&
      y <= VR_PROGRESS.y + VR_PROGRESS.height + VR_PROGRESS.hitPaddingY
    );
  }

  function seekVRProgress(x) {
    const pct = (x - VR_PROGRESS.x) / VR_PROGRESS.width;
    const targetPct = Math.max(0, Math.min(1, pct));
    if (hasSeekableDuration()) {
      video.currentTime = targetPct * video.duration;
    }
  }

  function drawVRPanel() {
    if (!vrPanelCtx) return;

    const ctx = vrPanelCtx;
    const w = VR_PANEL_SIZE.width;
    const h = VR_PANEL_SIZE.height;

    // Clear background
    ctx.clearRect(0, 0, w, h);

    // Draw main panel background (glassmorphism look)
    ctx.fillStyle = 'rgba(15, 15, 25, 0.85)';
    ctx.strokeStyle = 'rgba(139, 92, 246, 0.4)'; // Purple border
    ctx.lineWidth = 4;
    drawRoundedRect(ctx, 10, 10, w - 20, h - 20, 30, true, true);

    // ─── Play / Pause Button ───
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.beginPath();
    ctx.arc(VR_BUTTONS.play.x, VR_BUTTONS.play.y, VR_BUTTONS.play.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.stroke();

    ctx.fillStyle = '#f0f0f5';
    if (video.paused) {
      // Draw Play triangle
      ctx.beginPath();
      ctx.moveTo(VR_BUTTONS.play.x - 10, VR_BUTTONS.play.y - 20);
      ctx.lineTo(VR_BUTTONS.play.x + 20, VR_BUTTONS.play.y);
      ctx.lineTo(VR_BUTTONS.play.x - 10, VR_BUTTONS.play.y + 20);
      ctx.closePath();
      ctx.fill();
    } else {
      // Draw Pause bars
      ctx.fillRect(VR_BUTTONS.play.x - 12, VR_BUTTONS.play.y - 18, 8, 36);
      ctx.fillRect(VR_BUTTONS.play.x + 4, VR_BUTTONS.play.y - 18, 8, 36);
    }

    // ─── Rewind Button (10s) ───
    ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.beginPath();
    ctx.arc(VR_BUTTONS.rewind.x, VR_BUTTONS.rewind.y, VR_BUTTONS.rewind.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.stroke();

    // Rewind symbol (<<)
    ctx.fillStyle = '#8a8a9a';
    ctx.beginPath();
    ctx.moveTo(185, 128); ctx.lineTo(195, 118); ctx.lineTo(195, 138); ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(173, 128); ctx.lineTo(183, 118); ctx.lineTo(183, 138); ctx.closePath(); ctx.fill();

    // ─── Fast-Forward Button (10s) ───
    ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.beginPath();
    ctx.arc(VR_BUTTONS.forward.x, VR_BUTTONS.forward.y, VR_BUTTONS.forward.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.stroke();

    // Fast-Forward symbol (>>)
    ctx.fillStyle = '#8a8a9a';
    ctx.beginPath();
    ctx.moveTo(295, 128); ctx.lineTo(285, 118); ctx.lineTo(285, 138); ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(307, 128); ctx.lineTo(297, 118); ctx.lineTo(297, 138); ctx.closePath(); ctx.fill();

    // ─── Progress Bar Track ───
    const barX = VR_PROGRESS.x;
    const barY = VR_PROGRESS.y;
    const barW = VR_PROGRESS.width;
    const barH = VR_PROGRESS.height;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
    drawRoundedRect(ctx, barX, barY, barW, barH, 6, true, false);

    // Progress bar fill
    const progress = video.duration ? video.currentTime / video.duration : 0;
    ctx.fillStyle = getPurpleCyanGradient(ctx, barX, barY, barW);
    drawRoundedRect(ctx, barX, barY, barW * progress, barH, 6, true, false);

    // Progress handle (thumb)
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(barX + barW * progress, barY + barH / 2, 10, 0, Math.PI * 2);
    ctx.fill();

    // ─── Time Display Text ───
    ctx.fillStyle = '#8a8a9a';
    ctx.font = '24px Inter, sans-serif';
    ctx.fillText(`${formatTime(video.currentTime)} / ${formatTime(video.duration || 0)}`, barX, 95);

    // ─── Exit VR Button ───
    ctx.fillStyle = 'rgba(239, 68, 68, 0.12)';
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.3)';
    ctx.beginPath();
    ctx.arc(VR_BUTTONS.exit.x, VR_BUTTONS.exit.y, VR_BUTTONS.exit.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Exit text
    ctx.fillStyle = '#ef4444';
    ctx.font = 'bold 22px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('EXIT', VR_BUTTONS.exit.x, VR_BUTTONS.exit.y);

    // Reset alignment
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    // Tell Three.js the texture updated
    if (vrPanelTexture) vrPanelTexture.needsUpdate = true;
  }

  function getPurpleCyanGradient(ctx, x, y, w) {
    const grad = ctx.createLinearGradient(x, y, x + w, y);
    grad.addColorStop(0, '#8b5cf6');
    grad.addColorStop(1, '#06b6d4');
    return grad;
  }

  function drawRoundedRect(ctx, x, y, w, h, r, fill, stroke) {
    if (w < 0) w = 0;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    if (fill) ctx.fill();
    if (stroke) ctx.stroke();
  }

  function handlePanelClick(cx, cy) {
    // ─── Play / Pause Button ───
    if (isPointInCircle(cx, cy, VR_BUTTONS.play)) {
      togglePlay();
      return;
    }

    // ─── Rewind Button (10s) ───
    if (isPointInCircle(cx, cy, VR_BUTTONS.rewind)) {
      video.currentTime = Math.max(0, video.currentTime - 10);
      return;
    }

    // ─── Fast-Forward Button (10s) ───
    if (isPointInCircle(cx, cy, VR_BUTTONS.forward)) {
      video.currentTime = hasSeekableDuration()
        ? Math.min(video.duration, video.currentTime + 10)
        : video.currentTime + 10;
      return;
    }

    // ─── Progress Bar Click (Seeking) ───
    if (isPointInProgressHitArea(cx, cy)) {
      seekVRProgress(cx);
      return;
    }

    // ─── Exit VR Button ───
    if (isPointInCircle(cx, cy, VR_BUTTONS.exit)) {
      if (activeXRSession) {
        activeXRSession.end().catch(() => {});
      } else {
        const session = renderer.xr.getSession();
        if (session) session.end().catch(() => {});
      }
      return;
    }
  }

  function hasSeekableDuration() {
    return Number.isFinite(video.duration) && video.duration > 0;
  }
})();
