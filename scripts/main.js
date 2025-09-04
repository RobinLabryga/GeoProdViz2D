/**
 * GeoProdViz2D - Geometric Product Visualizer
 * Interactive 2D geometric product visualization
 */

class Vector2 {
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }

    clone() {
        return new Vector2(this.x, this.y);
    }

    equals(other) {
        if (!other) return false;

        return Math.abs(this.x - other.x) < 0.001 && Math.abs(this.y - other.y) < 0.001;
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

function normInf(v) {
    return Math.max(Math.abs(v.x), Math.abs(v.y));
}

class GeometricProduct {
    constructor(dot, wedge) {
        this.dot = dot;
        this.wedge = wedge;
    }

    /**
     * Returns the geometric product (this vector).
     * @param {Vector2} vector
     * @returns {Vector2}
     */
    prod_vector(vector) {
        return vector.scale(this.dot).sub(vector.rotate().scale(this.wedge));
    }
}

class VectorState {
    constructor(A = new Vector2(2, 1), B = new Vector2(-1, 1), C = new Vector2(-1, 0)) {
        this.A = A;
        this.B = B;
        this.C = C;
    }

    // Create a deep copy of the current state
    clone() {
        return new VectorState(
            this.A.clone(),
            this.B.clone(),
            this.C.clone()
        );
    }

    // Check if two states are equal
    equals(other) {
        if (!other) return false;

        return (
            this.A.equals(other.A) &&
            this.B.equals(other.B) &&
            this.C.equals(other.C)
        );
    }
}

class VectorVisualizerState {
    constructor(vector = new VectorState(), visibility = null) {
        this.vector = vector;
        this.visibility = visibility || {
            a: true,
            b: true,
            c: true,
            brot: true,
            dot: true,
            wedge: true,
            prodABC: true,
            prodCAB: true
        };
    }

    // Create a deep copy of the current state
    clone() {
        return new VectorVisualizerState(
            this.vector.clone(),
            { ...this.visibility }
        );
    }

    // Check if two states are equal
    equals(other) {
        if (!other) return false;

        return (
            this.vector.equals(other.vector) &&
            JSON.stringify(this.visibility) === JSON.stringify(other.visibility)
        );
    }
}

class VectorVisualizer {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.canvas = null;
        this.needsRender = true;

        // State
        this.state = new VectorVisualizerState();

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
        this.vectorProdABCMesh = null;
        this.vectorProdCABMesh = null;
        this.gridMesh = null;
        this.axesMesh = null;
        this.unitCircleMesh = null;

        // Interaction
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.isDragging = false;
        this.dragTarget = null;
        this.dragOffset = new THREE.Vector2();

        // Camera
        this.MIN_DISTANCE = 0.5;
        this.MAX_DISTANCE = 100;
        this.DEFAULT_DISTANCE = 10;
        this.ZOOM_SENSITIVITY = 0.1;
        this.cameraDistance = this.DEFAULT_DISTANCE;
        this.cameraRotationY = 0;      // left/right rotation
        this.cameraRotationX = 0;  // up/down rotation
        this.isDraggingCanvas = false;
        this.lastMousePosition = new THREE.Vector2();

        // History
        this.undoHistory = [];
        this.redoHistory = [];
        this.maxHistorySize = 50;
        this.lastSavedState = null;

        // Scroll tracking
        this.previousScrollPosition = 0;
        this.isScrollingToCanvas = false;
        this.returnButton = null;

        this.init();
    }

    init() {
        this.setupThreeJS();
        this.createScene();
        this.setupEventListeners();
        this.updateVectors();

        this.returnButton = document.getElementById('return-button');

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
        const rgbRegex = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/;
        const rgbMatch = rgbRegex.exec(computedColor);
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
        this.scene.background = new THREE.Color(this.getCSSColor('--color-surface'));

        const container = document.querySelector('.canvas-container');
        const width = container.clientWidth;
        const height = container.clientHeight;
        const aspect = width / height;

        // Camera
        const fov = 75; // in degrees
        this.camera = new THREE.PerspectiveCamera(
            fov,
            aspect,
            0.1,
            1000
        );

        this.updateCameraPosition();

        // Renderer
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            alpha: true
        });

        // Set initial size
        this.updateCanvasSize();
        this.renderer.setPixelRatio(window.devicePixelRatio);

        this.needsRender = true;
    }

    createScene() {
        this.createGrid();
        this.createUnitCircle();
        this.createAxes();
        this.createVectors();
        this.updateMeshVisibility();
    }

    createGrid() {
        const gridSize = 2 * Math.ceil((2 / 3) * this.MAX_DISTANCE);
        const divisions = gridSize;

        const grid = new THREE.GridHelper(gridSize, divisions, 0x334155, 0x1e293b);
        grid.rotation.x = Math.PI / 2;
        this.gridMesh = grid;
        this.scene.add(grid);
    }

    createUnitCircle() {
        const geometry = new THREE.RingGeometry(0.99, 1.01, 64);
        const material = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
        this.unitCircleMesh = new THREE.Mesh(geometry, material);
        this.scene.add(this.unitCircleMesh);

        this.unitCircleMesh.visible = false;
    }

    createAxes() {
        const axesGroup = new THREE.Group();

        const axesLength = Math.ceil((2 / 3) * this.MAX_DISTANCE);

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

        // Z-axis (blue)
        const zGeometry = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, 0, -axesLength),
            new THREE.Vector3(0, 0, axesLength)
        ]);
        const zMaterial = new THREE.LineBasicMaterial({ color: 0x6b5eff, linewidth: 2 });
        const zAxis = new THREE.Line(zGeometry, zMaterial);
        axesGroup.add(zAxis);

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
        const prodABCColor = this.getCSSColor('--prod-a-b-c-color');
        const prodCABColor = this.getCSSColor('--prod-c-a-b-color');

        this.vectorAMesh = this.createVector(this.state.vector.A, vectorAColor, 'A');
        this.vectorBMesh = this.createVector(this.state.vector.B, vectorBColor, 'B');
        this.vectorCMesh = this.createVector(this.state.vector.C, vectorCColor, 'C');
        this.vectorBRotMesh = this.createVector(this.state.vector.B.rotate(), vectorBRotColor, 'BRot');
        this.dotMesh = this.createParallelogram(this.state.vector.A, this.state.vector.B.rotate(), dotColor);
        this.wedgeMesh = this.createParallelogram(this.state.vector.A, this.state.vector.B, wedgeColor);
        this.vectorProdABCMesh = this.createVector(this.state.vector.A.prod_vector(this.state.vector.B).prod_vector(this.state.vector.C), prodABCColor, 'A\'B\'C\'');
        this.vectorProdCABMesh = this.createVector(this.state.vector.C.prod_vector(this.state.vector.A).prod_vector(this.state.vector.B), prodCABColor, 'C\'A\'B\'');

        // Create dashed helper vectors for parallelogram construction
        this.vectorADashedMeshWedge = this.createDashedVector(this.state.vector.A, vectorAColor, 'A\'Wedge');
        this.vectorADashedMeshDot = this.createDashedVector(this.state.vector.A, vectorAColor, 'A\'Dot')
        this.vectorBDashedMesh = this.createDashedVector(this.state.vector.B, vectorBColor, 'B\'');
        this.vectorBRotDashedMesh = this.createDashedVector(this.state.vector.B.rotate(), vectorBRotColor, 'BRot\'')

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
        this.scene.add(this.vectorProdABCMesh);
        this.scene.add(this.vectorProdCABMesh);
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

        this.needsRender = true;
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

        this.needsRender = true;
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

        this.needsRender = true;
    }

    updateVectors() {
        if (this.wedgeMesh) {
            this.updateParallelogram(this.wedgeMesh, this.state.vector.A, this.state.vector.B);
        }

        if (this.dotMesh) {
            this.updateParallelogram(this.dotMesh, this.state.vector.A, this.state.vector.B.rotate());
        }

        // Update dashed vectors for parallelogram construction
        if (this.vectorADashedMeshWedge && this.vectorBDashedMesh) {
            const vectorSum = this.state.vector.A.add(this.state.vector.B)
            // Vector A dashed: from tip of B to tip of Sum
            this.updateDashedVector(
                this.vectorADashedMeshWedge,
                { x: this.state.vector.B.x, y: this.state.vector.B.y },
                { x: vectorSum.x, y: vectorSum.y }
            );

            // Vector B dashed: from tip of A to tip of Sum
            this.updateDashedVector(
                this.vectorBDashedMesh,
                { x: this.state.vector.A.x, y: this.state.vector.A.y },
                { x: vectorSum.x, y: vectorSum.y }
            );
        }

        if (this.vectorADashedMeshDot && this.vectorBRotDashedMesh) {
            const vectorSum = this.state.vector.A.add(this.state.vector.B.rotate());

            this.updateDashedVector(
                this.vectorADashedMeshDot,
                { x: this.state.vector.B.rotate().x, y: this.state.vector.B.rotate().y },
                { x: vectorSum.x, y: vectorSum.y }
            );

            this.updateDashedVector(
                this.vectorBRotDashedMesh,
                { x: this.state.vector.A.x, y: this.state.vector.A.y },
                { x: vectorSum.x, y: vectorSum.y }
            );
        }

        this.updateVector(this.vectorProdABCMesh, this.state.vector.A.prod_vector(this.state.vector.B).prod_vector(this.state.vector.C));
        this.updateVector(this.vectorProdCABMesh, this.state.vector.C.prod_vector(this.state.vector.A).prod_vector(this.state.vector.B));

        this.updateUI();
    }

    updateUI() {
        // Update LaTeX vector displays
        this.updateVectorDisplay('vector-a-display', this.state.vector.A.x, this.state.vector.A.y);
        this.updateVectorDisplay('vector-b-display', this.state.vector.B.x, this.state.vector.B.y);
        this.updateVectorDisplay('vector-c-display', this.state.vector.C.x, this.state.vector.C.y);
        this.updateVectorDisplay('vector-brot-display', this.state.vector.B.rotate().x, this.state.vector.B.rotate().y);
        this.updateWedgeDisplay('wedge-a-b-display', this.state.vector.A, this.state.vector.B);
        this.updateDotDisplay('dot-a-b-display', this.state.vector.A, this.state.vector.B)
        this.updateVectorDisplay('prodABC-display', this.state.vector.A.prod_vector(this.state.vector.B).prod_vector(this.state.vector.C).x, this.state.vector.A.prod_vector(this.state.vector.B).prod_vector(this.state.vector.C).y);
        this.updateVectorDisplay('prodCAB-display', this.state.vector.C.prod_vector(this.state.vector.A).prod_vector(this.state.vector.B).x, this.state.vector.C.prod_vector(this.state.vector.A).prod_vector(this.state.vector.B).y);
        this.updateProdNormDisplay('prodABC-norm-display', this.state.vector.A, this.state.vector.B, this.state.vector.C, '\\vec{a}\\vec{b}\\vec{c}', 'abc');
        this.updateProdNormDisplay('prodCAB-norm-display', this.state.vector.C, this.state.vector.A, this.state.vector.B, '\\vec{c}\\vec{a}\\vec{b}', 'cab');

        // Update individual vector norms
        this.updateVectorNormDisplay('vector-a-norm-display', this.state.vector.A, 'a');
        this.updateVectorNormDisplay('vector-b-norm-display', this.state.vector.B, 'b');
        this.updateVectorNormDisplay('vector-c-norm-display', this.state.vector.C, 'c');
    }

    updateVectorDisplay(elementId, x, y) {
        const element = document.getElementById(elementId);

        const matrixContent = element.querySelector('.matrix-content');
        if (matrixContent) {
            // New format with draggable spans in matrix
            const xSpan = matrixContent.querySelector('[data-component="x"]');
            const ySpan = matrixContent.querySelector('[data-component="y"]');

            if (xSpan && ySpan) {
                xSpan.textContent = x.toFixed(2);
                ySpan.textContent = y.toFixed(2);
                return;
            }
        }

        // Fallback to LaTeX format for computed vectors
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

    updateProdNormDisplay(elementId, vectorA, vectorB, vectorC, latexName, fallbackName) {
        const element = document.getElementById(elementId);

        const norm = norm2(vectorA.prod_vector(vectorB).prod_vector(vectorC));

        const latex = `\\|${latexName}\\| = ${norm.toFixed(2)}`;

        // Re-render MathJax if available
        if (window.MathJax?.typesetPromise) {
            element.innerHTML = `$${latex}$`;
            window.MathJax.typesetPromise([element]).catch((err) => {
                console.warn('MathJax rendering error:', err);
                // Fallback to simple text display
                element.innerHTML = `||${fallbackName}|| = ${norm.toFixed(2)}`;
            });
        } else {
            // Fallback for when MathJax isn't loaded
            element.innerHTML = `||${fallbackName}|| = ${norm.toFixed(2)}`;
        }
    }

    updateVectorNormDisplay(elementId, vector, vectorName) {
        const element = document.getElementById(elementId);
        const norm = norm2(vector);

        // Update the entire LaTeX expression
        const latex = `\\|\\vec{${vectorName}}\\| = ${norm.toFixed(2)}`;

        // Re-render MathJax if available
        if (window.MathJax?.typesetPromise) {
            element.innerHTML = `$${latex}$`;
            window.MathJax.typesetPromise([element]).catch((err) => {
                console.warn('MathJax rendering error:', err);
                // Fallback to simple text display
                element.innerHTML = `||${vectorName}|| = ${norm.toFixed(2)}`;
            });
        } else {
            // Fallback for when MathJax isn't loaded
            element.innerHTML = `||${vectorName}|| = ${norm.toFixed(2)}`;
        }
    }

    updateMeshVisibility() {
        this.vectorAMesh.visible = this.state.visibility.a;

        this.vectorBMesh.visible = this.state.visibility.b;

        this.vectorCMesh.visible = this.state.visibility.c;

        this.vectorBRotMesh.visible = this.state.visibility.brot;

        this.dotMesh.visible = this.state.visibility.dot;

        this.wedgeMesh.visible = this.state.visibility.wedge;

        this.vectorADashedMeshWedge.visible = this.state.visibility.wedge && this.state.visibility.a;

        this.vectorBDashedMesh.visible = this.state.visibility.wedge && this.state.visibility.b;

        this.vectorADashedMeshDot.visible = this.state.visibility.dot && this.state.visibility.a;

        this.vectorBRotDashedMesh.visible = this.state.visibility.dot && this.state.visibility.brot;

        this.vectorProdABCMesh.visible = this.state.visibility.prodABC;

        this.vectorProdCABMesh.visible = this.state.visibility.prodCAB;

        this.needsRender = true;
    }

    updateCanvasSize() {
        const container = document.querySelector('.canvas-container');
        const width = container.clientWidth;
        const height = container.clientHeight;

        this.renderer.setSize(width, height);

        const aspect = width / height;
        this.camera.aspect = aspect;
        this.camera.updateProjectionMatrix();

        this.needsRender = true;
    }

    updateCameraPosition() {
        const position = new THREE.Vector3(0, 0, this.cameraDistance);

        position.applyAxisAngle(new THREE.Vector3(1, 0, 0), this.cameraRotationX);
        position.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.cameraRotationY);

        this.camera.position.copy(position);
        this.camera.lookAt(0, 0, 0);
        this.camera.updateMatrixWorld();

        // Hide Z-axis when camera is close to top-down view
        this.updateZAxisVisibility();

        this.needsRender = true;
    }

    updateZAxisVisibility() {
        if (this.axesMesh && this.axesMesh.children.length >= 3) {
            const zAxis = this.axesMesh.children[2]; // Z-axis is the third child
            const rotationThreshold = 0.1; // Radians
            
            zAxis.visible = Math.abs(this.cameraRotationX) > rotationThreshold || 
                                  Math.abs(this.cameraRotationY) > rotationThreshold;
        }
    }

    updateVisibility(target, vectorType) {
        // Update the UI color circle appearance
        if (this.state.visibility[vectorType]) {
            target.classList.remove('hidden');
        } else {
            target.classList.add('hidden');
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
                this.toggleVisibility(e.target, vectorType);
            });
        });

        // Normalize button handlers
        document.getElementById('normalize-a').addEventListener('click', () => this.normalizeVector('a'));
        document.getElementById('normalize-b').addEventListener('click', () => this.normalizeVector('b'));
        document.getElementById('normalize-c').addEventListener('click', () => this.normalizeVector('c'));

        // Toggle norm button handlers
        document.getElementById('toggle-norm-prodABC-btn').addEventListener('click', () => this.toggleIndividualNormDisplay('prodABC'));
        document.getElementById('toggle-norm-prodCAB-btn').addEventListener('click', () => this.toggleIndividualNormDisplay('prodCAB'));
        document.getElementById('toggle-norm-a-btn').addEventListener('click', () => this.toggleIndividualNormDisplay('a'));
        document.getElementById('toggle-norm-b-btn').addEventListener('click', () => this.toggleIndividualNormDisplay('b'));
        document.getElementById('toggle-norm-c-btn').addEventListener('click', () => this.toggleIndividualNormDisplay('c'));

        // Undo/Redo keyboard shortcuts
        window.addEventListener('keydown', (e) => {
            if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'z') {
                e.preventDefault();
                this.undo();
            } else if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'y') {
                e.preventDefault();
                this.redo();
            }
        });

        // Example buttons
        document.getElementById('example-dot-basis-parallel').addEventListener('click', () => {
            this.loadExample(DOT_PARALLEL_BASIS_EXAMPLE);
        });

        document.getElementById('example-dot-basis-orthogonal').addEventListener('click', () => {
            this.loadExample(DOT_ORTHOGONAL_BASIS_EXAMPLE);
        });

        document.getElementById('example-orthogonal').addEventListener('click', () => {
            this.loadExample(DOT_ORTHOGONAL_EXAMPLE);
        });

        document.getElementById('example-codirectional').addEventListener('click', () => {
            this.loadExample((DOT_CODIRECTIONAL_EXAMPLE));
        });

        document.getElementById('example-self').addEventListener('click', () => {
            this.loadExample(DOT_SELF_EXAMPLE);
        });

        document.getElementById('example-sign-switch').addEventListener('click', () => {
            this.loadExample(DOT_SIGN_SWITCH_EXAMPLE);
        });

        document.getElementById('example-wedge-basis-parallel').addEventListener('click', () => {
            this.loadExample(WEDGE_PARALLEL_BASIS_EXAMPLE);
        });

        document.getElementById('example-wedge-basis-orthogonal').addEventListener('click', () => {
            this.loadExample(WEDGE_ORTHOGONAL_BASIS_EXAMPLE);
        });

        document.getElementById('example-wedge-negative-basis-orthogonal').addEventListener('click', () => {
            this.loadExample(WEDGE_NEGATIVE_ORTHOGONAL_BASIS_EXAMPLE);
        });

        document.getElementById('example-geo-product').addEventListener('click', () => {
            this.loadExample(GEOMETRIC_PRODUCT_EXAMPLE);
        });

        // Return button
        document.getElementById('return-button').addEventListener('click', () => {
            this.returnToPreviousPosition();
        });

        // Scroll tracking to hide return button when user manually scrolls
        let scrollTimeout;
        window.addEventListener('scroll', () => {
            // Don't hide button if we're programmatically scrolling to canvas
            if (this.isScrollingToCanvas) return;

            // Clear previous timeout
            clearTimeout(scrollTimeout);

            // Set timeout to hide button after user stops scrolling
            scrollTimeout = setTimeout(() => {
                const currentScroll = window.pageYOffset || document.documentElement.scrollTop;

                // Hide return button if user has scrolled back close to original position
                const scrollDifferenceFromOriginal = this.previousScrollPosition - currentScroll;
                if (scrollDifferenceFromOriginal < 500)
                    this.hideReturnButton();
            }, 100);
        });

        this.setupDraggableNumbers();
    }

    setupDraggableNumbers() {
        this.numberDragState = {
            isDragging: false,
            element: null,
            vector: null,
            component: null,
            startY: 0,
            startValue: 0
        };

        const draggableNumbers = document.querySelectorAll('.draggable-number');

        draggableNumbers.forEach(element => {
            element.addEventListener('mousedown', this.onNumberMouseDown.bind(this));
        });

        document.addEventListener('mousemove', this.onNumberMouseMove.bind(this));
        document.addEventListener('mouseup', this.onNumberMouseUp.bind(this));
    }

    onNumberMouseDown(event) {
        event.preventDefault();
        event.stopPropagation();

        const element = event.target;
        const vector = element.getAttribute('data-vector');
        const component = element.getAttribute('data-component');

        this.saveState();

        this.numberDragState = {
            isDragging: true,
            element: element,
            vector: vector,
            component: component,
            startY: event.clientY,
            startValue: this.getVectorComponentValue(vector, component)
        };

        element.classList.add('dragging');
        document.body.style.cursor = 'ns-resize';
    }

    onNumberMouseMove(event) {
        if (!this.numberDragState.isDragging) return;

        event.preventDefault();

        const deltaY = this.numberDragState.startY - event.clientY;
        const sensitivity = 0.01;
        const newValue = this.numberDragState.startValue + (deltaY * sensitivity);

        this.updateVectorComponent(this.numberDragState.vector, this.numberDragState.component, newValue);
    }

    onNumberMouseUp(event) {
        if (!this.numberDragState.isDragging) return;

        this.numberDragState.element.classList.remove('dragging');
        document.body.style.cursor = '';

        this.numberDragState = {
            isDragging: false,
            element: null,
            vector: null,
            component: null,
            startY: 0,
            startValue: 0
        };
    }

    getVectorComponentValue(vectorType, component) {
        const vector = this.state.vector[vectorType.toUpperCase()];
        return component === 'x' ? vector.x : vector.y;
    }

    updateVectorComponent(vectorType, component, value) {
        if (component === 'x') {
            this.state.vector[vectorType.toUpperCase()].x = value;
        } else if (component === 'y') {
            this.state.vector[vectorType.toUpperCase()].y = value;
        }

        const vectorKey = vectorType.toUpperCase();
        if (vectorKey === 'A') {
            this.updateVector(this.vectorAMesh, this.state.vector.A);
        } else if (vectorKey === 'B') {
            this.updateVector(this.vectorBMesh, this.state.vector.B);
            this.updateVector(this.vectorBRotMesh, this.state.vector.B.rotate());
        } else if (vectorKey === 'C') {
            this.updateVector(this.vectorCMesh, this.state.vector.C);
        }

        // Update all related calculations and displays
        this.updateVectors();
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

                    this.saveState();

                    this.canvas.style.cursor = 'grabbing';
                    vectorSelected = true;
                    break;
                }
            }

            if (!vectorSelected) {
                this.isDraggingCanvas = true;
                this.lastMousePosition.set(event.clientX, event.clientY);
                this.canvas.style.cursor = 'grabbing';
            }
        }
    }

    moveVector() {
        // Use raycasting to find intersection with the XY plane (z = 0)
        this.raycaster.setFromCamera(this.mouse, this.camera);

        // Create a plane at z = 0 to intersect with
        const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
        const intersectionPoint = new THREE.Vector3();

        if (this.raycaster.ray.intersectPlane(plane, intersectionPoint)) {
            const worldX = intersectionPoint.x;
            const worldY = intersectionPoint.y;

            // Update the appropriate vector
            if (this.dragTarget === 'a') {
                this.state.vector.A = new Vector2(worldX, worldY);
                this.updateVector(this.vectorAMesh, this.state.vector.A);
            } else if (this.dragTarget === 'b') {
                this.state.vector.B = new Vector2(worldX, worldY);
                this.updateVector(this.vectorBMesh, this.state.vector.B);
                this.updateVector(this.vectorBRotMesh, this.state.vector.B.rotate());
            } else if (this.dragTarget === 'c') {
                this.state.vector.C = new Vector2(worldX, worldY);
                this.updateVector(this.vectorCMesh, this.state.vector.C);
            }

            this.updateVectors();
        }
    }

    rotateCamera(event) {
        const deltaX = event.clientX - this.lastMousePosition.x;
        const deltaY = event.clientY - this.lastMousePosition.y;

        const rotationSpeed = 0.005;

        this.cameraRotationY -= deltaX * rotationSpeed; // left/right
        this.cameraRotationX -= deltaY * rotationSpeed; // up/down

        const maxVerticalAngle = Math.PI / 3;
        this.cameraRotationX = Math.max(-maxVerticalAngle, Math.min(maxVerticalAngle, this.cameraRotationX));

        this.cameraRotationY = this.cameraRotationY % (2 * Math.PI);

        this.updateCameraPosition();

        this.lastMousePosition.set(event.clientX, event.clientY);
    }

    onMouseMove(event) {
        this.getMousePosition(event);

        if (this.isDragging && this.dragTarget) {
            this.moveVector();
        } else if (this.isDraggingCanvas) {
            this.rotateCamera(event);
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
            this.isDraggingCanvas = false;
            this.canvas.style.cursor = 'default';
        }
    }

    onWheel(event) {
        event.preventDefault();

        this.cameraDistance = Math.max(this.MIN_DISTANCE, Math.min(this.MAX_DISTANCE, this.cameraDistance + event.deltaY * this.ZOOM_SENSITIVITY))

        this.updateCameraPosition();
    }

    onWindowResize() {
        this.updateCanvasSize();
    }

    setVectorState(vectorState) {
        this.state.vector = vectorState;

        this.updateVector(this.vectorAMesh, this.state.vector.A);
        this.updateVector(this.vectorBMesh, this.state.vector.B);
        this.updateVector(this.vectorCMesh, this.state.vector.C);
        this.updateVector(this.vectorBRotMesh, this.state.vector.B.rotate());
        this.updateVectors();
    }

    setState(state) {
        this.state = state;

        this.setVectorState(this.state.vector);

        this.updateMeshVisibility();

        // Reset color circle appearances
        const colorCircles = document.querySelectorAll('.vector-color[data-vector-type]');
        colorCircles.forEach(circle => {
            const vectorType = circle.getAttribute('data-vector-type');
            this.updateVisibility(circle, vectorType);
        });
    }

    resetVectors() {
        this.setState(new VectorVisualizerState());

        // Reset camera
        this.cameraDistance = this.DEFAULT_DISTANCE;
        this.cameraRotationY = 0;
        this.cameraRotationX = 0;
        this.updateCameraPosition();
    }

    toggleGrid() {
        this.gridMesh.visible = !this.gridMesh.visible;
        this.needsRender = true;
    }

    toggleUnitCircle() {
        this.unitCircleMesh.visible = !this.unitCircleMesh.visible;
        this.needsRender = true;
    }

    toggleVisibility(target, vectorType) {
        // Toggle the visibility state
        this.state.visibility[vectorType] = !this.state.visibility[vectorType];

        // Update the visual elements
        this.updateMeshVisibility();

        this.updateVisibility(target, vectorType);
    }

    toggleIndividualNormDisplay(vectorType) {
        const normDisplay = document.getElementById(`norm-${vectorType}-display`);
        const toggleBtn = document.getElementById(`toggle-norm-${vectorType}-btn`);
        const icon = toggleBtn.querySelector('i');

        // Toggle the collapsed state
        normDisplay.classList.toggle('collapsed');
        toggleBtn.classList.toggle('collapsed');

        // Update the icon
        if (normDisplay.classList.contains('collapsed')) {
            icon.className = 'fa-solid fa-chevron-right';
        } else {
            icon.className = 'fa-solid fa-chevron-down';
        }
    }

    normalizeVector(vectorType) {
        this.saveState();

        let vector, mesh, otherMesh;

        switch (vectorType) {
            case 'a':
                vector = this.state.vector.A.normalize();
                this.state.vector.A = vector;
                mesh = this.vectorAMesh;
                break;
            case 'b':
                vector = this.state.vector.B.normalize();
                this.state.vector.B = vector;
                mesh = this.vectorBMesh;
                otherMesh = this.vectorBRotMesh;
                break;
            case 'c':
                vector = this.state.vector.C.normalize();
                this.state.vector.C = vector;
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
            this.updateVector(otherMesh, this.state.vector.B.rotate());
        }

        // Update all related calculations and displays
        this.updateVectors();
    }

    saveState() {
        if (this.lastSavedState?.equals(this.state.vector))
            return;

        const currentState = this.state.vector.clone();

        this.undoHistory.push(currentState);
        this.redoHistory = [];
        this.lastSavedState = currentState;

        if (this.undoHistory.length > this.maxHistorySize) {
            this.undoHistory.shift();
        }
    }

    undo() {
        if (this.undoHistory.length <= 0)
            return;

        this.redoHistory.push(this.state.vector.clone());

        const previousState = this.undoHistory.pop();
        this.setVectorState(previousState);
        this.lastSavedState = this.undoHistory.length > 0 ? this.undoHistory[this.undoHistory.length - 1] : null;
    }

    redo() {
        if (this.redoHistory.length <= 0)
            return;

        this.lastSavedState = this.state.vector.clone();
        this.undoHistory.push(this.lastSavedState);

        const nextState = this.redoHistory.pop();
        this.setVectorState(nextState);
    }

    loadExample(state) {
        this.saveState();
        this.setState(state);

        this.scrollToCanvas();
    }

    scrollToCanvas() {
        // Store current scroll position before scrolling
        this.previousScrollPosition = window.pageYOffset || document.documentElement.scrollTop;

        const canvas = document.getElementById('threejs-canvas');
        if (canvas) {
            this.isScrollingToCanvas = true;
            canvas.scrollIntoView({ behavior: 'smooth', block: 'center' });

            // Show return button after a delay to allow scroll to complete
            setTimeout(() => {
                this.showReturnButton();
                this.isScrollingToCanvas = false;
            }, 1000);
        }
    }

    showReturnButton() {
        if (this.returnButton) {
            this.returnButton.classList.remove('hidden');
        }
    }

    hideReturnButton() {
        if (this.returnButton) {
            this.returnButton.classList.add('hidden');
        }
    }

    returnToPreviousPosition() {
        if (this.previousScrollPosition !== undefined) {
            window.scrollTo({
                top: this.previousScrollPosition,
                behavior: 'smooth'
            });

            this.hideReturnButton();
        }
    }

    validateStateJSON(json) {
        try {
            // Check for required structure
            if (!json.vector || !json.visibility) return false;

            // Check vector structure
            const vector = json.vector;
            if (!vector.A || !vector.B || !vector.C) return false;

            // Check that each vector has x and y coordinates
            if (typeof vector.A.x !== 'number' || typeof vector.A.y !== 'number') return false;
            if (typeof vector.B.x !== 'number' || typeof vector.B.y !== 'number') return false;
            if (typeof vector.C.x !== 'number' || typeof vector.C.y !== 'number') return false;

            // Check visibility structure
            const visibility = json.visibility;
            const requiredKeys = ['a', 'b', 'c', 'brot', 'dot', 'wedge', 'prod'];
            for (const key of requiredKeys) {
                if (typeof visibility[key] !== 'boolean') return false;
            }

            return true;
        } catch (error) {
            console.error('Error validating JSON:', error);
            return false;
        }
    }

    animate() {
        requestAnimationFrame(this.animate.bind(this));

        if (this.needsRender || this.isDragging) {
            this.renderer.render(this.scene, this.camera);
            this.needsRender = false;
        }
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

const DOT_PARALLEL_BASIS_EXAMPLE = new VectorVisualizerState(
    new VectorState(
        new Vector2(1, 0),
        new Vector2(1, 0),
        new Vector2(0, 0)), {
    a: true,
    b: true,
    c: false,
    brot: true,
    dot: true,
    wedge: false,
    prodABC: false,
    prodCAB: false
});

const DOT_ORTHOGONAL_BASIS_EXAMPLE = new VectorVisualizerState(
    new VectorState(
        new Vector2(1, 0),
        new Vector2(0, 1),
        new Vector2(0, 0)), {
    a: true,
    b: true,
    c: false,
    brot: true,
    dot: true,
    wedge: false,
    prodABC: false,
    prodCAB: false
});

const DOT_ORTHOGONAL_EXAMPLE = new VectorVisualizerState(
    new VectorState(
        new Vector2(2, 1),
        new Vector2(-1, 2),
        new Vector2(0, 0)), {
    a: true,
    b: true,
    c: false,
    brot: true,
    dot: true,
    wedge: false,
    prodABC: false,
    prodCAB: false
});

const DOT_CODIRECTIONAL_EXAMPLE = new VectorVisualizerState(
    new VectorState(
        new Vector2(2, 1),
        new Vector2(-3, -1.5),
        new Vector2(0, 0)), {
    a: true,
    b: true,
    c: false,
    brot: true,
    dot: true,
    wedge: false,
    prodABC: false,
    prodCAB: false
});

const DOT_SELF_EXAMPLE = new VectorVisualizerState(
    new VectorState(
        new Vector2(2, 0),
        new Vector2(2, 0),
        new Vector2(0, 0)), {
    a: true,
    b: true,
    c: false,
    brot: true,
    dot: true,
    wedge: false,
    prodABC: false,
    prodCAB: false
});

const DOT_SIGN_SWITCH_EXAMPLE = new VectorVisualizerState(
    new VectorState(
        new Vector2(2, -1),
        new Vector2(1, 1),
        new Vector2(0, 0)), {
    a: true,
    b: true,
    c: false,
    brot: true,
    dot: true,
    wedge: false,
    prodABC: false,
    prodCAB: false
});

const WEDGE_PARALLEL_BASIS_EXAMPLE = new VectorVisualizerState(
    new VectorState(
        new Vector2(1, 0),
        new Vector2(1, 0),
        new Vector2(0, 0)), {
    a: true,
    b: true,
    c: false,
    brot: false,
    dot: false,
    wedge: true,
    prodABC: false,
    prodCAB: false
});

const WEDGE_ORTHOGONAL_BASIS_EXAMPLE = new VectorVisualizerState(
    new VectorState(
        new Vector2(1, 0),
        new Vector2(0, 1),
        new Vector2(0, 0)), {
    a: true,
    b: true,
    c: false,
    brot: false,
    dot: false,
    wedge: true,
    prodABC: false,
    prodCAB: false
});

const WEDGE_NEGATIVE_ORTHOGONAL_BASIS_EXAMPLE = new VectorVisualizerState(
    new VectorState(
        new Vector2(0, 1),
        new Vector2(1, 0),
        new Vector2(0, 0)), {
    a: true,
    b: true,
    c: false,
    brot: false,
    dot: false,
    wedge: true,
    prodABC: false,
    prodCAB: false
});

const WEDGE_ORTHOGONAL_EXAMPLE = new VectorVisualizerState(
    new VectorState(
        new Vector2(2, 1),
        new Vector2(-1, 2),
        new Vector2(0, 0)), {
    a: true,
    b: true,
    c: false,
    brot: false,
    dot: false,
    wedge: true,
    prodABC: false,
    prodCAB: false
});

const WEDGE_CODIRECTIONAL_EXAMPLE = new VectorVisualizerState(
    new VectorState(
        new Vector2(2, 1),
        new Vector2(-3, -1.5),
        new Vector2(0, 0)), {
    a: true,
    b: true,
    c: false,
    brot: false,
    dot: false,
    wedge: true,
    prodABC: false,
    prodCAB: false
});

const WEDGE_SELF_EXAMPLE = new VectorVisualizerState(
    new VectorState(
        new Vector2(2, 0),
        new Vector2(2, 0),
        new Vector2(0, 0)), {
    a: true,
    b: true,
    c: false,
    brot: false,
    dot: false,
    wedge: true,
    prodABC: false,
    prodCAB: false
});

const WEDGE_SIGN_SWITCH_EXAMPLE = new VectorVisualizerState(
    new VectorState(
        new Vector2(2, -1),
        new Vector2(1, 1),
        new Vector2(0, 0)), {
    a: true,
    b: true,
    c: false,
    brot: false,
    dot: false,
    wedge: true,
    prodABC: false,
    prodCAB: false
});

const GEOMETRIC_PRODUCT_EXAMPLE = new VectorVisualizerState(
    new VectorState(
        new Vector2(5, 1).normalize(),
        new Vector2(2, -1).normalize(),
        new Vector2(1, 1)), {
    a: true,
    b: true,
    c: true,
    brot: false,
    dot: false,
    wedge: false,
    prodABC: true,
    prodCAB: true
});