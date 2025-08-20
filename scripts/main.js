/**
 * GeoProdViz - Geometric Product Visualizer
 * Interactive 2D geometric product visualization
 */

class Vector2 {
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }

    scale(scalar) {
        return new Vector2(this.x * scalar, this.y * scalar);
    }

    add(other) {
        return new Vector2(this.x + other.x, this.y + other.y);
    }

    sub(other) {
        return new Vector2(this.x - other.x, this.y - other.y);
    }

    neg() {
        return new Vector2(-this.x, -this.y);
    }

    dot(other) {
        return this.x * other.x + this.y * other.y
    }

    wedge(other) {
        return this.x * other.y - this.y * other.x;
    }

    rotate() {
        return new Vector2(-this.y, this.x);
    }

    normalize() {
        return this.scale(1.0 / norm2(this));
    }

    prod_vector(other) {
        return new GeometricProduct(this.dot(other), this.wedge(other));
    }
}

function norm2(v) {
    return Math.sqrt(v.dot(v));
}

function norm1(v) {
    return Math.abs(v.x) + Math.abs(v.y);
}

function norm0(v) {
    // "norm0" is usually the number of nonzero components (pseudo-norm)
    return (v.x !== 0 ? 1 : 0) + (v.y !== 0 ? 1 : 0);
}

function norminf(v) {
    return Math.max(Math.abs(v.x), Math.abs(v.y));
}

class GeometricProduct {
    constructor(dot, wedge) {
        this.dot = dot;
        this.wedge = wedge;
    }

    prod_vector(vector) {
        return vector.scale(this.dot).add(vector.rotate().scale(this.wedge));
    }
}

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
        this.vectorA = new Vector2(2, 1);
        this.vectorB = new Vector2(-1, 1);
        this.vectorC = new Vector2(-1, 0);

        // Three.js objects
        this.vectorAMesh = null;
        this.vectorBMesh = null;
        this.vectorCMesh = null;
        this.vectorBRotMesh = null;
        this.dotMesh = null; // Parallelogram spanned by A and B rotated by 90° CCW
        this.wedgeMesh = null; // Parallelogram spanned by A and B
        this.vectorADashedMeshWedge = null; // A vector from tip of B to tip of Sum
        this.vectorADashedMeshDot = null;
        this.vectorBDashedMesh = null; // B vector from tip of A to tip of Sum
        this.vectorBRotDashedMesh = null;
        this.gridMesh = null;
        this.axesMesh = null;
        this.unitCircleMesh = null;

        // Interaction
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.isDragging = false;
        this.dragTarget = null;
        this.dragOffset = new THREE.Vector2();

        // Camera controls
        this.cameraTarget = new THREE.Vector2(0, 0);
        this.zoom = this.DEFAULT_ZOOM;

        // Visibility state for different elements
        this.visibility = {
            a: true,
            b: true,
            c: true,
            brot: true,
            dot: true,
            wedge: true,
            prod: true,
        };

        this.init();
    }

    init() {
        this.setupThreeJS();
        this.createScene();
        this.setupEventListeners();
        this.updateVectors();
        
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
        this.createUnitCircle();
        this.createAxes();
        this.createVectors();
        this.updateVisibility();
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

    createUnitCircle() {
        const geometry = new THREE.RingGeometry( 0.99, 1.01, 64 ); 
        const material = new THREE.MeshBasicMaterial( { color: 0xffffff, side: THREE.DoubleSide } );
        this.unitCircleMesh = new THREE.Mesh( geometry, material );
        this.scene.add( this.unitCircleMesh );

        this.unitCircleMesh.visible = false;
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

        this.axesMesh = axesGroup;
        this.scene.add(axesGroup);
    }

    createVectors() {
        // Get colors from CSS variables
        const vectorAColor = this.getCSSColor('--vector-a-color');
        const vectorBColor = this.getCSSColor('--vector-b-color');
        const vectorCColor = this.getCSSColor('--vector-c-color');
        const vectorBRotColor = this.getCSSColor('--vector-brot-color');
        const dotColor = this.getCSSColor('--dot-a-b-color');
        const wedgeColor = this.getCSSColor('--wedge-a-b-color');
        const prodColor = this.getCSSColor('--prod-a-b-c-color');

        this.vectorAMesh = this.createVector(this.vectorA, vectorAColor, 'A');
        this.vectorBMesh = this.createVector(this.vectorB, vectorBColor, 'B');
        this.vectorCMesh = this.createVector(this.vectorC, vectorCColor, 'C');
        this.vectorBRotMesh = this.createVector(this.vectorB.rotate(), vectorBRotColor, 'BRot');
        this.dotMesh = this.createParallelogram(this.vectorA, this.vectorB.rotate(), dotColor);
        this.wedgeMesh = this.createParallelogram(this.vectorA, this.vectorB, wedgeColor);
        this.vectorProdMesh = this.createVector(this.vectorA.prod_vector(this.vectorB).prod_vector(this.vectorC), prodColor, 'A\'B\'C\'');

        // Create dashed helper vectors for parallelogram construction
        this.vectorADashedMeshWedge = this.createDashedVector(this.vectorA, vectorAColor, 'A\'Wedge');
        this.vectorADashedMeshDot = this.createDashedVector(this.vectorA, vectorAColor, 'A\'Dot')
        this.vectorBDashedMesh = this.createDashedVector(this.vectorB, vectorBColor, 'B\'');
        this.vectorBRotDashedMesh = this.createDashedVector(this.vectorB.rotate(), vectorBRotColor, 'BRot\'')

        this.scene.add(this.wedgeMesh);
        this.scene.add(this.dotMesh);
        this.scene.add(this.vectorADashedMeshWedge);
        this.scene.add(this.vectorBDashedMesh);
        this.scene.add(this.vectorADashedMeshDot)
        this.scene.add(this.vectorBRotDashedMesh);
        this.scene.add(this.vectorBRotMesh);
        this.scene.add(this.vectorAMesh);
        this.scene.add(this.vectorBMesh);
        this.scene.add(this.vectorCMesh);
        this.scene.add(this.vectorProdMesh);
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
        const headHeight = 0.15
        const headGeometry = new THREE.ConeGeometry(headHeight / 2.0, headHeight, 3);
        const headMaterial = new THREE.MeshBasicMaterial({ color: color });
        const head = new THREE.Mesh(headGeometry, headMaterial);

        // Position and rotate arrow head
        const angle = Math.atan2(vector.y, vector.x);
        head.position.set(vector.x, vector.y, 0);
        head.rotation.z = angle - Math.PI / 2;
        group.add(head);

        // Draggable endpoint (only for vectors A and B)
        if (label === 'A' || label === 'B' || label === 'C') {
            const endpointGeometry = new THREE.CircleGeometry(0.15, 6);
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
        const headHeight = 0.15 / 2.0
        const headGeometry = new THREE.ConeGeometry(headHeight / 2.0, headHeight, 3);
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

    createParallelogram(vectorA, vectorB, color) {
        const group = new THREE.Group();

        // Calculate the four vertices of the parallelogram
        const origin = new THREE.Vector3(0, 0, 0);
        const vertexA = new THREE.Vector3(vectorA.x, vectorA.y, 0);
        const vertexB = new THREE.Vector3(vectorB.x, vectorB.y, 0);
        const vertexSum = new THREE.Vector3(vectorA.x + vectorB.x, vectorA.y + vectorB.y, 0);

        // Create parallelogram geometry
        const geometry = new THREE.BufferGeometry();
        const vertices = new Float32Array([
            // First triangle: origin, A, Sum
            origin.x, origin.y, origin.z,
            vertexA.x, vertexA.y, vertexA.z,
            vertexSum.x, vertexSum.y, vertexSum.z,
            // Second triangle: origin, Sum, B
            origin.x, origin.y, origin.z,
            vertexSum.x, vertexSum.y, vertexSum.z,
            vertexB.x, vertexB.y, vertexB.z
        ]);

        geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
        geometry.computeVertexNormals();

        // Create material with transparency
        const material = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: 0.3,
            side: THREE.DoubleSide
        });

        const parallelogram = new THREE.Mesh(geometry, material);
        group.add(parallelogram);

        // Add outline
        const outlineGeometry = new THREE.BufferGeometry();
        const outlineVertices = new Float32Array([
            origin.x, origin.y, origin.z,
            vertexA.x, vertexA.y, vertexA.z,
            vertexSum.x, vertexSum.y, vertexSum.z,
            vertexB.x, vertexB.y, vertexB.z,
            origin.x, origin.y, origin.z  // Close the loop
        ]);
        outlineGeometry.setAttribute('position', new THREE.BufferAttribute(outlineVertices, 3));

        const outlineMaterial = new THREE.LineBasicMaterial({
            color: color,
            linewidth: 2,
            transparent: true,
            opacity: 0.8
        });

        const outline = new THREE.LineLoop(outlineGeometry, outlineMaterial);
        group.add(outline);

        group.userData = {
            vectorType: 'parallelogram',
            color: color
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

    updateParallelogram(parallelogramMesh, vectorA, vectorB) {
        // Calculate the four vertices of the parallelogram
        const origin = new THREE.Vector3(0, 0, 0);
        const vertexA = new THREE.Vector3(vectorA.x, vectorA.y, 0);
        const vertexB = new THREE.Vector3(vectorB.x, vectorB.y, 0);
        const vertexSum = new THREE.Vector3(vectorA.x + vectorB.x, vectorA.y + vectorB.y, 0);

        // Update the parallelogram mesh (first child)
        const parallelogram = parallelogramMesh.children[0];
        const positions = parallelogram.geometry.attributes.position.array;
        
        // First triangle: origin, A, Sum
        positions[0] = origin.x; positions[1] = origin.y; positions[2] = origin.z;
        positions[3] = vertexA.x; positions[4] = vertexA.y; positions[5] = vertexA.z;
        positions[6] = vertexSum.x; positions[7] = vertexSum.y; positions[8] = vertexSum.z;
        
        // Second triangle: origin, Sum, B
        positions[9] = origin.x; positions[10] = origin.y; positions[11] = origin.z;
        positions[12] = vertexSum.x; positions[13] = vertexSum.y; positions[14] = vertexSum.z;
        positions[15] = vertexB.x; positions[16] = vertexB.y; positions[17] = vertexB.z;
        
        parallelogram.geometry.attributes.position.needsUpdate = true;
        parallelogram.geometry.computeVertexNormals();

        // Update the outline (second child)
        const outline = parallelogramMesh.children[1];
        const outlinePositions = outline.geometry.attributes.position.array;
        
        outlinePositions[0] = origin.x; outlinePositions[1] = origin.y; outlinePositions[2] = origin.z;
        outlinePositions[3] = vertexA.x; outlinePositions[4] = vertexA.y; outlinePositions[5] = vertexA.z;
        outlinePositions[6] = vertexSum.x; outlinePositions[7] = vertexSum.y; outlinePositions[8] = vertexSum.z;
        outlinePositions[9] = vertexB.x; outlinePositions[10] = vertexB.y; outlinePositions[11] = vertexB.z;
        outlinePositions[12] = origin.x; outlinePositions[13] = origin.y; outlinePositions[14] = origin.z;
        
        outline.geometry.attributes.position.needsUpdate = true;
    }

    updateVectors() {
        if (this.wedgeMesh) {
            this.updateParallelogram(this.wedgeMesh, this.vectorA, this.vectorB);
        }
        
        if (this.dotMesh) {
            this.updateParallelogram(this.dotMesh, this.vectorA, this.vectorB.rotate());
        }
        
        // Update dashed vectors for parallelogram construction
        if (this.vectorADashedMeshWedge && this.vectorBDashedMesh) {
            const vectorSum = this.vectorA.add(this.vectorB)
            // Vector A dashed: from tip of B to tip of Sum
            this.updateDashedVector(
                this.vectorADashedMeshWedge,
                { x: this.vectorB.x, y: this.vectorB.y },
                { x: vectorSum.x, y: vectorSum.y }
            );

            // Vector B dashed: from tip of A to tip of Sum
            this.updateDashedVector(
                this.vectorBDashedMesh,
                { x: this.vectorA.x, y: this.vectorA.y },
                { x: vectorSum.x, y: vectorSum.y }
            );
        }

        if (this.vectorADashedMeshDot && this.vectorBRotDashedMesh) {
            const vectorSum = this.vectorA.add(this.vectorB.rotate());

            this.updateDashedVector(
                this.vectorADashedMeshDot,
                { x: this.vectorB.rotate().x, y: this.vectorB.rotate().y },
                { x: vectorSum.x, y: vectorSum.y }
            );

            this.updateDashedVector(
                this.vectorBRotDashedMesh,
                { x: this.vectorA.x, y: this.vectorA.y },
                { x: vectorSum.x, y: vectorSum.y }
            );
        }

        this.updateVector(this.vectorProdMesh, this.vectorA.prod_vector(this.vectorB).prod_vector(this.vectorC));

        this.updateUI();
    }

    updateUI() {
        // Update LaTeX vector displays
        this.updateVectorDisplay('vector-a-display', this.vectorA.x, this.vectorA.y);
        this.updateVectorDisplay('vector-b-display', this.vectorB.x, this.vectorB.y);
        this.updateVectorDisplay('vector-c-display', this.vectorC.x, this.vectorC.y);
        this.updateVectorDisplay('vector-brot-display', this.vectorB.rotate().x, this.vectorB.rotate().y);
        this.updateWedgeDisplay('wedge-a-b-display', this.vectorA, this.vectorB);
        this.updateDotDisplay('dot-a-b-display', this.vectorA, this.vectorB)
        this.updateVectorDisplay('prod-a-b-c-display', this.vectorA.prod_vector(this.vectorB).prod_vector(this.vectorC).x, this.vectorA.prod_vector(this.vectorB).prod_vector(this.vectorC).y);
    }

    updateVectorDisplay(elementId, x, y) {
        const element = document.getElementById(elementId);
        const latex = `\\begin{pmatrix} ${x.toFixed(2)} \\\\ ${y.toFixed(2)} \\end{pmatrix}`;

        // Re-render MathJax if available
        if (window.MathJax?.typesetPromise) {
            element.innerHTML = `\\(${latex}\\)`;
            window.MathJax.typesetPromise([element]).catch((err) => {
                console.warn('MathJax rendering error:', err);
                // Fallback to simple parentheses display
                element.innerHTML = `<div class="vector-fallback">
                    <span>(</span>
                    <div class="vector-coords">
                        <span>${x.toFixed(2)}</span>
                        <span>${y.toFixed(2)}</span>
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

    updateDotDisplay(elementId, vectorA, vectorB) {
        const element = document.getElementById(elementId);

        const dot = vectorA.dot(vectorB);
        
        // Update the entire LaTeX expression
        const latex = `\\vec{a}\\cdot\\vec{b}I = \\vec{a}\\wedge\\vec{b}_\\perp = ${dot.toFixed(2)} I`;

        // Re-render MathJax if available
        if (window.MathJax?.typesetPromise) {
            element.innerHTML = `$${latex}$`;
            window.MathJax.typesetPromise([element]).catch((err) => {
                console.warn('MathJax rendering error:', err);
                // Fallback to simple text display
                element.innerHTML = `a.bI = ${dot.toFixed(2)} I`;
            });
        } else {
            // Fallback for when MathJax isn't loaded
            element.innerHTML = `a.bI = ${dot.toFixed(2)} I`;
        }
    }

    updateWedgeDisplay(elementId, vectorA, vectorB) {
        const element = document.getElementById(elementId);

        const wedge = vectorA.wedge(vectorB);
        
        // Update the entire LaTeX expression
        const latex = `\\vec{a}\\wedge\\vec{b} = ${wedge.toFixed(2)} I`;

        // Re-render MathJax if available
        if (window.MathJax?.typesetPromise) {
            element.innerHTML = `$${latex}$`;
            window.MathJax.typesetPromise([element]).catch((err) => {
                console.warn('MathJax rendering error:', err);
                // Fallback to simple text display
                element.innerHTML = `a∧b = ${wedge.toFixed(2)} I`;
            });
        } else {
            // Fallback for when MathJax isn't loaded
            element.innerHTML = `a∧b = ${wedge.toFixed(2)} I`;
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
        document.getElementById('toggle-unit-circle').addEventListener('click', this.toggleUnitCircle.bind(this));

        // Color circle click handlers
        const colorCircles = document.querySelectorAll('.vector-color[data-vector-type]');
        colorCircles.forEach(circle => {
            circle.addEventListener('click', (e) => {
                const vectorType = e.target.getAttribute('data-vector-type');
                this.toggleVisibility(vectorType);
            });
        });

        // Normalize button handlers
        document.getElementById('normalize-a').addEventListener('click', () => this.normalizeVector('a'));
        document.getElementById('normalize-b').addEventListener('click', () => this.normalizeVector('b'));
        document.getElementById('normalize-c').addEventListener('click', () => this.normalizeVector('c'));
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
                this.vectorA = new Vector2(worldX, worldY);
                this.updateVector(this.vectorAMesh, this.vectorA);
            } else if (this.dragTarget === 'b') {
                this.vectorB = new Vector2(worldX, worldY);
                this.updateVector(this.vectorBMesh, this.vectorB);
                this.updateVector(this.vectorBRotMesh, this.vectorB.rotate());
            } else if (this.dragTarget === 'c') {
                this.vectorC = new Vector2(worldX, worldY);
                this.updateVector(this.vectorCMesh, this.vectorC);
            }

            this.updateVectors();
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
        this.vectorA = new Vector2(2, 1);
        this.vectorB = new Vector2(-1, 1);
        this.vectorC = new Vector2(-1, 0);

        this.updateVector(this.vectorAMesh, this.vectorA);
        this.updateVector(this.vectorBMesh, this.vectorB);
        this.updateVector(this.vectorCMesh, this.vectorC);
        this.updateVector(this.vectorBRotMesh, this.vectorB.rotate());
        this.updateVectors();

        // Reset visibility states
        this.visibility = {
            a: true,
            b: true,
            brot: true,
            dot: true,
            wedge: true
        };

        // Reset color circle appearances
        const colorCircles = document.querySelectorAll('.vector-color[data-vector-type]');
        colorCircles.forEach(circle => {
            circle.classList.remove('hidden');
        });

        this.updateVisibility();

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

    toggleUnitCircle() {
        this.unitCircleMesh.visible = !this.unitCircleMesh.visible;
    }

    toggleVisibility(vectorType) {
        // Toggle the visibility state
        this.visibility[vectorType] = !this.visibility[vectorType];
        
        // Update the visual elements
        this.updateVisibility();
        
        // Update the UI color circle appearance
        const colorCircle = document.querySelector(`[data-vector-type="${vectorType}"]`);
        if (colorCircle) {
            if (this.visibility[vectorType]) {
                colorCircle.classList.remove('hidden');
            } else {
                colorCircle.classList.add('hidden');
            }
        }
    }

    updateVisibility() {
        if (this.vectorAMesh) {
            this.vectorAMesh.visible = this.visibility.a;
        }

        if (this.vectorBMesh) {
            this.vectorBMesh.visible = this.visibility.b;
        }

        if (this.vectorCMesh) {
            this.vectorCMesh.visible = this.visibility.c;
        }

        if (this.vectorBRotMesh) {
            this.vectorBRotMesh.visible = this.visibility.brot;
        }

        if (this.dotMesh) {
            this.dotMesh.visible = this.visibility.dot;
        }

        if (this.wedgeMesh) {
            this.wedgeMesh.visible = this.visibility.wedge;
        }

        if (this.vectorADashedMeshWedge) {
            this.vectorADashedMeshWedge.visible = this.visibility.wedge && this.visibility.a;
        }

        if (this.vectorBDashedMesh) {
            this.vectorBDashedMesh.visible = this.visibility.wedge && this.visibility.b;
        }

        if (this.vectorADashedMeshDot) {
            this.vectorADashedMeshDot.visible = this.visibility.dot && this.visibility.a;
        }

        if (this.vectorBRotDashedMesh) {
            this.vectorBRotDashedMesh.visible = this.visibility.dot && this.visibility.brot;
        }

        if (this.vectorProdMesh) {
            this.vectorProdMesh.visible = this.visibility.prod;
        }
    }

    normalizeVector(vectorType) {
        let vector, mesh, otherMesh;
        
        switch(vectorType) {
            case 'a':
                vector = this.vectorA.normalize();
                this.vectorA = vector;
                mesh = this.vectorAMesh;
                break;
            case 'b':
                vector = this.vectorB.normalize();
                this.vectorB = vector;
                mesh = this.vectorBMesh;
                otherMesh = this.vectorBRotMesh;
                break;
            case 'c':
                vector = this.vectorC.normalize();
                this.vectorC = vector;
                mesh = this.vectorCMesh;
                break;
            default:
                return;
        }

        // Update the vector mesh
        if (mesh) {
            this.updateVector(mesh, vector);
        }

        // Update rotated vector if it's vector B
        if (vectorType === 'b' && otherMesh) {
            this.updateVector(otherMesh, this.vectorB.rotate());
        }

        // Update all related calculations and displays
        this.updateVectors();
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
