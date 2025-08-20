/**
 * GeoProdViz - Geometric Product Visualizer
 * Interactive 2D geometric product visualization
 */

class VectorVisualizer {
    constructor() {
        // Zoom constants
        this.MIN_ZOOM = 0.1;
        this.MAX_ZOOM = 5;
        this.DEFAULT_ZOOM = 1;

        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.canvas = null;

        // Vector objects
        this.vectorA = { x: 2, y: 3 };
        this.vectorB = { x: -1, y: 2 };
        this.vectorSum = { x: 0, y: 0 };

        // Three.js objects
        this.vectorAMesh = null;
        this.vectorBMesh = null;
        this.vectorSumMesh = null;
        this.vectorADashedMesh = null; // A vector from tip of B to tip of Sum
        this.vectorBDashedMesh = null; // B vector from tip of A to tip of Sum
        this.gridMesh = null;
        this.axesMesh = null;

        // Interaction
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.isDragging = false;
        this.dragTarget = null;
        this.dragOffset = new THREE.Vector2();

        // Camera controls
        this.cameraTarget = new THREE.Vector2(0, 0);
        this.zoom = this.DEFAULT_ZOOM;

        this.init();
    }

    init() {
        this.setupThreeJS();
        this.createScene();
        this.setupEventListeners();
        this.updateVectorSum();
        
        // Ensure proper sizing after layout is complete
        requestAnimationFrame(() => {
            this.updateCanvasSize();
        });
        
        this.animate();
    }

    getCSSColor(cssVariable) {
        // Get the CSS variable value from the document root
        const cssValue = getComputedStyle(document.documentElement)
            .getPropertyValue(cssVariable)
            .trim();
        
        // Convert CSS color to hex format for Three.js
        // Create a temporary element to get the computed color
        const tempElement = document.createElement('div');
        tempElement.style.color = cssValue;
        document.body.appendChild(tempElement);
        
        const computedColor = getComputedStyle(tempElement).color;
        document.body.removeChild(tempElement);
        
        // Convert rgb(r, g, b) to hex
        const rgbMatch = computedColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
        if (rgbMatch) {
            const r = parseInt(rgbMatch[1]);
            const g = parseInt(rgbMatch[2]);
            const b = parseInt(rgbMatch[3]);
            return (r << 16) | (g << 8) | b;
        }
        
        // Fallback to a default color if parsing fails
        return 0xff0000; // Red as fallback
    }

    setupThreeJS() {
        this.canvas = document.getElementById('threejs-canvas');

        // Scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0f172a);

        const container = document.querySelector('.canvas-container');
        const width = container.clientWidth;
        const height = container.clientHeight;
        const aspect = width / height;

        // Camera (orthographic for 2D)
        const frustumSize = 10;
        this.camera = new THREE.OrthographicCamera(
            -frustumSize * aspect / 2, frustumSize * aspect / 2,
            frustumSize / 2, -frustumSize / 2,
            1, 1000
        );
        this.camera.position.z = 100;

        // Renderer
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            alpha: true
        });

        // Set initial size
        this.updateCanvasSize();
        this.renderer.setPixelRatio(window.devicePixelRatio);
    }

    createScene() {
        this.createGrid();
        this.createAxes();
        this.createVectors();
    }

    createGrid() {
        // Calculate grid size based on zoom range
        // At minimum zoom (0.1), frustumSize = 10 / 0.1 = 100
        // We want the grid to fill the entire viewable area at min zoom
        const maxViewSize = 10 / this.MIN_ZOOM; // 100 at min zoom
        const gridSize = maxViewSize * 1.2; // 20% larger for buffer
        const divisions = gridSize; // One division per 2 units

        const grid = new THREE.GridHelper(gridSize, divisions, 0x334155, 0x1e293b);
        grid.rotation.x = Math.PI / 2;
        this.gridMesh = grid;
        this.scene.add(grid);
    }

    createAxes() {
        const axesGroup = new THREE.Group();

        // Calculate axes length to match grid size
        const maxViewSize = 10 / this.MIN_ZOOM; // 100 at min zoom
        const axesLength = maxViewSize * 0.6; // Slightly shorter than grid

        // X-axis (red)
        const xGeometry = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(-axesLength, 0, 0),
            new THREE.Vector3(axesLength, 0, 0)
        ]);
        const xMaterial = new THREE.LineBasicMaterial({ color: 0xff6b6b, linewidth: 2 });
        const xAxis = new THREE.Line(xGeometry, xMaterial);
        axesGroup.add(xAxis);

        // Y-axis (green)
        const yGeometry = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, -axesLength, 0),
            new THREE.Vector3(0, axesLength, 0)
        ]);
        const yMaterial = new THREE.LineBasicMaterial({ color: 0x51cf66, linewidth: 2 });
        const yAxis = new THREE.Line(yGeometry, yMaterial);
        axesGroup.add(yAxis);

        // Origin point
        const originGeometry = new THREE.CircleGeometry(0.1, 16);
        const originMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const origin = new THREE.Mesh(originGeometry, originMaterial);
        axesGroup.add(origin);

        this.axesMesh = axesGroup;
        this.scene.add(axesGroup);
    }

    createVectors() {
        // Get colors from CSS variables
        const vectorAColor = this.getCSSColor('--vector-a-color');
        const vectorBColor = this.getCSSColor('--vector-b-color');
        const vectorSumColor = this.getCSSColor('--vector-sum-color');

        this.vectorAMesh = this.createVector(this.vectorA, vectorAColor, 'A');
        this.vectorBMesh = this.createVector(this.vectorB, vectorBColor, 'B');
        this.vectorSumMesh = this.createVector(this.vectorSum, vectorSumColor, 'Sum');

        // Create dashed helper vectors for parallelogram construction
        this.vectorADashedMesh = this.createDashedVector(this.vectorA, vectorAColor, 'A\'');
        this.vectorBDashedMesh = this.createDashedVector(this.vectorB, vectorBColor, 'B\'');

        this.scene.add(this.vectorAMesh);
        this.scene.add(this.vectorBMesh);
        this.scene.add(this.vectorSumMesh);
        this.scene.add(this.vectorADashedMesh);
        this.scene.add(this.vectorBDashedMesh);
    }

    createVector(vector, color, label) {
        const group = new THREE.Group();

        // Arrow shaft
        const shaftGeometry = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(vector.x, vector.y, 0)
        ]);
        const shaftMaterial = new THREE.LineBasicMaterial({
            color: color,
            linewidth: 3,
            transparent: true,
            opacity: 0.9
        });
        const shaft = new THREE.Line(shaftGeometry, shaftMaterial);
        group.add(shaft);

        // Arrow head
        const headGeometry = new THREE.ConeGeometry(0.15, 0.4, 8);
        const headMaterial = new THREE.MeshBasicMaterial({ color: color });
        const head = new THREE.Mesh(headGeometry, headMaterial);

        // Position and rotate arrow head
        const angle = Math.atan2(vector.y, vector.x);
        head.position.set(vector.x, vector.y, 0);
        head.rotation.z = angle - Math.PI / 2;
        group.add(head);

        // Draggable endpoint (only for vectors A and B)
        if (label === 'A' || label === 'B') {
            const endpointGeometry = new THREE.CircleGeometry(0.2, 16);
            const endpointMaterial = new THREE.MeshBasicMaterial({
                color: color,
                transparent: true,
                opacity: 0.8
            });
            const endpoint = new THREE.Mesh(endpointGeometry, endpointMaterial);
            endpoint.position.set(vector.x, vector.y, 0.01);
            endpoint.userData = { draggable: true, vectorType: label.toLowerCase() };
            group.add(endpoint);
        }

        // Label
        const labelDiv = document.createElement('div');
        labelDiv.className = 'vector-label';
        labelDiv.textContent = label;
        labelDiv.style.position = 'absolute';
        labelDiv.style.color = `#${color.toString(16).padStart(6, '0')}`;
        labelDiv.style.fontFamily = 'Inter, sans-serif';
        labelDiv.style.fontWeight = '600';
        labelDiv.style.fontSize = '14px';
        labelDiv.style.pointerEvents = 'none';
        labelDiv.style.zIndex = '1000';

        group.userData = {
            label: labelDiv,
            vectorType: label.toLowerCase(),
            color: color
        };

        return group;
    }

    createDashedVector(vector, color, label) {
        const group = new THREE.Group();

        // Create dashed line material
        const dashedMaterial = new THREE.LineDashedMaterial({
            color: color,
            linewidth: 2,
            scale: 1,
            dashSize: 0.2,
            gapSize: 0.1,
            transparent: true,
            opacity: 0.6
        });

        // Arrow shaft (will be positioned later)
        const shaftGeometry = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(vector.x, vector.y, 0)
        ]);
        const shaft = new THREE.Line(shaftGeometry, dashedMaterial);
        shaft.computeLineDistances(); // Required for dashed lines
        group.add(shaft);

        // Small arrow head for dashed vectors
        const headGeometry = new THREE.ConeGeometry(0.1, 0.25, 8);
        const headMaterial = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: 0.6
        });
        const head = new THREE.Mesh(headGeometry, headMaterial);
        group.add(head);

        group.userData = {
            vectorType: label.toLowerCase(),
            color: color,
            isDashed: true
        };

        return group;
    }

    updateVector(vectorMesh, vector) {
        // Update shaft
        const shaft = vectorMesh.children[0];
        const positions = shaft.geometry.attributes.position.array;
        positions[3] = vector.x;
        positions[4] = vector.y;
        shaft.geometry.attributes.position.needsUpdate = true;

        // Update arrow head
        const head = vectorMesh.children[1];
        const angle = Math.atan2(vector.y, vector.x);
        head.position.set(vector.x, vector.y, 0);
        head.rotation.z = angle - Math.PI / 2;

        // Update endpoint if it exists
        if (vectorMesh.children[2]) {
            vectorMesh.children[2].position.set(vector.x, vector.y, 0.01);
        }
    }

    updateDashedVector(vectorMesh, startPoint, endPoint) {
        // Update shaft
        const shaft = vectorMesh.children[0];
        const positions = shaft.geometry.attributes.position.array;
        positions[0] = startPoint.x;
        positions[1] = startPoint.y;
        positions[3] = endPoint.x;
        positions[4] = endPoint.y;
        shaft.geometry.attributes.position.needsUpdate = true;
        shaft.computeLineDistances(); // Required for dashed lines

        // Update arrow head
        const head = vectorMesh.children[1];
        const vectorX = endPoint.x - startPoint.x;
        const vectorY = endPoint.y - startPoint.y;
        const angle = Math.atan2(vectorY, vectorX);
        head.position.set(endPoint.x, endPoint.y, 0);
        head.rotation.z = angle - Math.PI / 2;
    }

    updateVectorSum() {
        this.vectorSum.x = this.vectorA.x + this.vectorB.x;
        this.vectorSum.y = this.vectorA.y + this.vectorB.y;

        if (this.vectorSumMesh) {
            this.updateVector(this.vectorSumMesh, this.vectorSum);
        }

        // Update dashed vectors for parallelogram construction
        if (this.vectorADashedMesh && this.vectorBDashedMesh) {
            // Vector A dashed: from tip of B to tip of Sum
            this.updateDashedVector(
                this.vectorADashedMesh,
                { x: this.vectorB.x, y: this.vectorB.y },
                { x: this.vectorSum.x, y: this.vectorSum.y }
            );

            // Vector B dashed: from tip of A to tip of Sum
            this.updateDashedVector(
                this.vectorBDashedMesh,
                { x: this.vectorA.x, y: this.vectorA.y },
                { x: this.vectorSum.x, y: this.vectorSum.y }
            );
        }

        this.updateUI();
    }

    updateUI() {
        // Update LaTeX vector displays
        this.updateVectorDisplay('vector-a-display', this.vectorA.x, this.vectorA.y);
        this.updateVectorDisplay('vector-b-display', this.vectorB.x, this.vectorB.y);
        this.updateVectorDisplay('vector-sum-display', this.vectorSum.x, this.vectorSum.y);

        // Update magnitudes
        document.getElementById('vector-a-mag').textContent =
            Math.sqrt(this.vectorA.x ** 2 + this.vectorA.y ** 2).toFixed(2);
        document.getElementById('vector-b-mag').textContent =
            Math.sqrt(this.vectorB.x ** 2 + this.vectorB.y ** 2).toFixed(2);
        document.getElementById('vector-sum-mag').textContent =
            Math.sqrt(this.vectorSum.x ** 2 + this.vectorSum.y ** 2).toFixed(2);
    }

    updateVectorDisplay(elementId, x, y) {
        const element = document.getElementById(elementId);
        const latex = `\\begin{pmatrix} ${x.toFixed(1)} \\\\ ${y.toFixed(1)} \\end{pmatrix}`;

        // Re-render MathJax if available
        if (window.MathJax?.typesetPromise) {
            element.innerHTML = `\\(${latex}\\)`;
            window.MathJax.typesetPromise([element]).catch((err) => {
                console.warn('MathJax rendering error:', err);
                // Fallback to simple parentheses display
                element.innerHTML = `<div class="vector-fallback">
                    <span>(</span>
                    <div class="vector-coords">
                        <span>${x.toFixed(1)}</span>
                        <span>${y.toFixed(1)}</span>
                    </div>
                    <span>)</span>
                </div>`;
            });
        } else {
            // Fallback for when MathJax isn't loaded
            element.innerHTML = `<div class="vector-fallback">
                <span>(</span>
                <div class="vector-coords">
                    <span>${x.toFixed(1)}</span>
                    <span>${y.toFixed(1)}</span>
                </div>
                <span>)</span>
            </div>`;
        }
    }

    setupEventListeners() {
        // Mouse events
        this.canvas.addEventListener('mousedown', this.onMouseDown.bind(this));
        this.canvas.addEventListener('mousemove', this.onMouseMove.bind(this));
        this.canvas.addEventListener('mouseup', this.onMouseUp.bind(this));
        this.canvas.addEventListener('wheel', this.onWheel.bind(this));

        // Prevent context menu
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

        // Window resize
        window.addEventListener('resize', this.onWindowResize.bind(this));

        // Control buttons
        document.getElementById('reset-btn').addEventListener('click', this.resetVectors.bind(this));
        document.getElementById('toggle-grid').addEventListener('click', this.toggleGrid.bind(this));
    }

    getMousePosition(event) {
        const rect = this.canvas.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    }

    onMouseDown(event) {
        this.getMousePosition(event);

        if (event.button === 0) { // Left mouse button
            this.raycaster.setFromCamera(this.mouse, this.camera);
            const intersects = this.raycaster.intersectObjects(this.scene.children, true);

            let vectorSelected = false;
            for (let intersect of intersects) {
                if (intersect.object.userData.draggable) {
                    this.isDragging = true;
                    this.dragTarget = intersect.object.userData.vectorType;
                    this.canvas.style.cursor = 'grabbing';
                    vectorSelected = true;
                    break;
                }
            }
            
            // If no vector was selected, start panning with left mouse
            if (!vectorSelected) {
                this.canvas.style.cursor = 'grabbing';
            }
        }
    }

    onMouseMove(event) {
        this.getMousePosition(event);

        if (this.isDragging && this.dragTarget) {
            // Get exact mouse position in canvas coordinates
            const rect = this.canvas.getBoundingClientRect();
            const mouseX = event.clientX - rect.left;
            const mouseY = event.clientY - rect.top;
            
            // Convert to normalized device coordinates (-1 to 1)
            const ndcX = (mouseX / rect.width) * 2 - 1;
            const ndcY = -(mouseY / rect.height) * 2 + 1;
            
            // Convert to world coordinates using camera frustum
            const frustumSize = 10 / this.zoom;
            const aspect = rect.width / rect.height;
            
            const worldX = (ndcX * frustumSize * aspect / 2) + this.camera.position.x;
            const worldY = (ndcY * frustumSize / 2) + this.camera.position.y;

            // Update the appropriate vector
            if (this.dragTarget === 'a') {
                this.vectorA.x = worldX;
                this.vectorA.y = worldY;
                this.updateVector(this.vectorAMesh, this.vectorA);
            } else if (this.dragTarget === 'b') {
                this.vectorB.x = worldX;
                this.vectorB.y = worldY;
                this.updateVector(this.vectorBMesh, this.vectorB);
            }

            this.updateVectorSum();
        } else {
            // Check if hovering over draggable objects
            this.raycaster.setFromCamera(this.mouse, this.camera);
            const intersects = this.raycaster.intersectObjects(this.scene.children, true);

            let isHovering = false;
            for (let intersect of intersects) {
                if (intersect.object.userData.draggable) {
                    isHovering = true;
                    break;
                }
            }

            this.canvas.style.cursor = isHovering ? 'grab' : 'default';
        }
    }

    onMouseUp(event) {
        if (event.button === 0) {
            this.isDragging = false;
            this.dragTarget = null;
            this.canvas.style.cursor = 'default';
        }
    }

    onWheel(event) {
        event.preventDefault();

        const zoomSpeed = 0.1;
        const zoomFactor = event.deltaY > 0 ? 1 + zoomSpeed : 1 - zoomSpeed;

        const currentZoom = this.zoom || this.DEFAULT_ZOOM;
        const newZoom = Math.max(this.MIN_ZOOM, Math.min(this.MAX_ZOOM, currentZoom * zoomFactor));
        this.zoom = newZoom;

        const frustumSize = 10 / this.zoom;
        const aspect = this.camera.aspect;

        this.camera.left = -frustumSize * aspect / 2;
        this.camera.right = frustumSize * aspect / 2;
        this.camera.top = frustumSize / 2;
        this.camera.bottom = -frustumSize / 2;
        this.camera.updateProjectionMatrix();
    }

    updateCanvasSize() {
        const container = document.querySelector('.canvas-container');
        const width = container.clientWidth;
        const height = container.clientHeight;

        this.renderer.setSize(width, height);

        const aspect = width / height;
        const frustumSize = 10 / this.zoom;

        this.camera.left = -frustumSize * aspect / 2;
        this.camera.right = frustumSize * aspect / 2;
        this.camera.top = frustumSize / 2;
        this.camera.bottom = -frustumSize / 2;
        this.camera.aspect = aspect;
        this.camera.updateProjectionMatrix();
    }

    onWindowResize() {
        this.updateCanvasSize();
    }

    resetVectors() {
        this.vectorA = { x: 2, y: 3 };
        this.vectorB = { x: -1, y: 2 };

        this.updateVector(this.vectorAMesh, this.vectorA);
        this.updateVector(this.vectorBMesh, this.vectorB);
        this.updateVectorSum();

        // Reset camera and zoom
        this.zoom = this.DEFAULT_ZOOM;
        this.cameraTarget.set(0, 0);
        this.camera.position.set(0, 0, 100);

        const frustumSize = 10 / this.zoom;
        const aspect = this.camera.aspect;
        this.camera.left = -frustumSize * aspect / 2;
        this.camera.right = frustumSize * aspect / 2;
        this.camera.top = frustumSize / 2;
        this.camera.bottom = -frustumSize / 2;
        this.camera.updateProjectionMatrix();
    }

    toggleGrid() {
        this.gridMesh.visible = !this.gridMesh.visible;
    }

    animate() {
        requestAnimationFrame(this.animate.bind(this));
        this.renderer.render(this.scene, this.camera);
    }
}

// Initialize the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Add loading state
    const canvas = document.getElementById('threejs-canvas');
    canvas.classList.add('loading');

    // Wait for fonts and other resources to fully load
    const initializeApp = () => {
        // Use requestAnimationFrame to ensure layout is complete
        requestAnimationFrame(() => {
            const visualizer = new VectorVisualizer();
            canvas.classList.remove('loading');

            // Store reference for potential future use
            window.vectorVisualizer = visualizer;
        });
    };

    // If document is already loaded, initialize immediately
    if (document.readyState === 'complete') {
        initializeApp();
    } else {
        // Otherwise wait for window load event
        window.addEventListener('load', initializeApp);
    }
});

// Export for potential module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = VectorVisualizer;
}
