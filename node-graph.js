class SimpleNodeGraph {
    constructor() {
        this.canvas = document.getElementById('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.nodes = new Map();
        this.edges = [];
        this.selectedNodes = new Set();
        this.selectedEdges = new Set();
        this.currentTool = 'select';
        this.isDragging = false;
        this.dragStartNode = null; // Reset drag start node
        this.dragOffset = { x: 0, y: 0 };
        this.dragStartNode = null; // Track which node we started dragging from
        this.edgeStartNode = null;
        this.isMarqueeSelecting = false;
        this.marqueeStart = { x: 0, y: 0 };
        this.marqueeEnd = { x: 0, y: 0 };
        this.marqueeDirection = 'right'; // 'right' for contained, 'left' for intersecting
        this.lastCreatedNode = null;
        
        // Zoom and pan properties
        this.zoom = 1;
        this.panX = 0;
        this.panY = 0;
        this.isPanning = false;
        this.panStart = { x: 0, y: 0 };
        
        this.setupEventListeners();
        this.setupCanvas();
        this.render();
    }

    setupCanvas() {
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
    }

    resizeCanvas() {
        const rect = this.canvas.getBoundingClientRect();
        this.canvas.width = rect.width * window.devicePixelRatio;
        this.canvas.height = rect.height * window.devicePixelRatio;
        this.canvas.style.width = rect.width + 'px';
        this.canvas.style.height = rect.height + 'px';
        this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
        this.render();
    }

    setupEventListeners() {
        // Tool selection
        document.getElementById('selectTool').addEventListener('click', () => this.setTool('select'));
        document.getElementById('addNodeTool').addEventListener('click', () => this.setTool('addNode'));
        document.getElementById('addEdgeTool').addEventListener('click', () => this.setTool('addEdge'));
        document.getElementById('zoomExtentsTool').addEventListener('click', () => this.zoomExtents());
        
        // Node property updates - automatic on input change
        document.getElementById('nodeName').addEventListener('input', () => this.updateSelectedNodes());
        document.getElementById('nodeColor').addEventListener('input', () => this.updateSelectedNodes());

        // Canvas events
        this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.handleMouseUp(e));
        this.canvas.addEventListener('wheel', (e) => this.handleWheel(e));
        
        // Global mouse events for marquee selection that goes outside canvas
        document.addEventListener('mousemove', (e) => this.handleGlobalMouseMove(e));
        document.addEventListener('mouseup', (e) => this.handleGlobalMouseUp(e));
        
        // Keyboard events
        document.addEventListener('keydown', (e) => this.handleKeyDown(e));
    }

    setTool(tool) {
        this.currentTool = tool;
        this.updateToolButtons();
        this.updateStatus();
        this.canvas.style.cursor = this.getCursorForTool(tool);
    }

    updateToolButtons() {
        const tools = ['select', 'addNode', 'addEdge'];
        tools.forEach(tool => {
            const button = document.getElementById(tool + 'Tool');
            button.classList.toggle('active', tool === this.currentTool);
        });
    }

    getCursorForTool(tool) {
        switch(tool) {
            case 'select': return 'default';
            case 'addNode': return 'crosshair';
            case 'addEdge': return 'crosshair';
            default: return 'default';
        }
    }

    updateStatus() {
        const statusText = document.getElementById('statusText');
        switch(this.currentTool) {
            case 'select': statusText.textContent = 'Select tool - Click and drag to move nodes'; break;
            case 'addNode': statusText.textContent = 'Add Node tool - Click to add nodes'; break;
            case 'addEdge': statusText.textContent = 'Add Edge tool - Click two nodes to connect them'; break;
        }
    }

    zoomExtents() {
        if (this.nodes.size === 0) {
            this.updateStatus('No nodes to zoom to');
            return;
        }

        // Calculate bounding box of all nodes
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        
        for (const node of this.nodes.values()) {
            minX = Math.min(minX, node.x - node.radius);
            maxX = Math.max(maxX, node.x + node.radius);
            minY = Math.min(minY, node.y - node.radius);
            maxY = Math.max(maxY, node.y + node.radius);
        }
        
        // Add some padding around the nodes
        const padding = 50;
        const nodeWidth = maxX - minX + padding * 2;
        const nodeHeight = maxY - minY + padding * 2;
        
        // Get canvas dimensions
        const canvasWidth = this.canvas.width / window.devicePixelRatio;
        const canvasHeight = this.canvas.height / window.devicePixelRatio;
        
        // Calculate zoom level to fit all nodes
        const zoomX = canvasWidth / nodeWidth;
        const zoomY = canvasHeight / nodeHeight;
        const newZoom = Math.min(zoomX, zoomY, 5); // Cap at 5x zoom
        
        // Calculate center of nodes
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        
        // Calculate pan to center the nodes
        const newPanX = canvasWidth / 2 - centerX * newZoom;
        const newPanY = canvasHeight / 2 - centerY * newZoom;
        
        // Apply the new zoom and pan
        this.zoom = newZoom;
        this.panX = newPanX;
        this.panY = newPanY;
        
        this.updateStatus(`Zoomed to fit all ${this.nodes.size} nodes`);
        this.render();
    }

    handleWheel(e) {
        e.preventDefault();
        
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
        const newZoom = Math.max(0.1, Math.min(5, this.zoom * zoomFactor));
        
        // Zoom towards mouse position
        const zoomChange = newZoom / this.zoom;
        this.panX = mouseX - (mouseX - this.panX) * zoomChange;
        this.panY = mouseY - (mouseY - this.panY) * zoomChange;
        this.zoom = newZoom;
        
        this.render();
    }

    handleMouseDown(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left - this.panX) / this.zoom;
        const y = (e.clientY - rect.top - this.panY) / this.zoom;

        // Check for middle mouse button (panning)
        if (e.button === 1) {
            this.isPanning = true;
            this.panStart = { x: e.clientX, y: e.clientY };
            this.canvas.style.cursor = 'grabbing';
            return;
        }

        if (this.currentTool === 'addNode') {
            this.addNode(x, y);
        } else if (this.currentTool === 'addEdge') {
            const node = this.getNodeAt(x, y);
            if (node) {
                if (this.edgeStartNode === null) {
                    this.edgeStartNode = node;
                    this.updateStatus('Click another node to create edge');
                } else if (this.edgeStartNode !== node) {
                    this.addEdge(this.edgeStartNode, node);
                    this.edgeStartNode = null;
                    this.updateStatus('Add Edge tool - Click two nodes to connect them');
                }
            }
        } else if (this.currentTool === 'select') {
            const node = this.getNodeAt(x, y);
            const edge = this.getEdgeAt(x, y);
            
            console.log('Select tool click:', {
                x, y,
                clickedNode: node ? node.id : 'none',
                clickedEdge: edge ? edge.id : 'none',
                selectedNodes: Array.from(this.selectedNodes).map(n => n.id),
                shiftKey: e.shiftKey
            });
            
            if (node) {
                // Check if this node is already selected
                if (this.selectedNodes.has(node)) {
                    console.log('Clicked on already selected node, starting drag from this node');
                    this.isDragging = true;
                    this.dragStartNode = node; // Remember which node we started dragging from
                    this.dragOffset = {
                        x: x - node.x,
                        y: y - node.y
                    };
                } else if (e.shiftKey) {
                    // Shift+click: add to selection
                    console.log('Shift+click: adding node to selection');
                    this.selectedNodes.add(node);
                    this.isDragging = true;
                    this.dragStartNode = node; // Remember which node we started dragging from
                    this.dragOffset = {
                        x: x - node.x,
                        y: y - node.y
                    };
                } else {
                    // Regular click on unselected node: replace selection
                    console.log('Regular click on unselected node: replacing selection');
                    this.selectedNodes.clear();
                    this.selectedEdges.clear();
                    this.selectedNodes.add(node);
                    this.isDragging = true;
                    this.dragStartNode = node; // Remember which node we started dragging from
                    this.dragOffset = {
                        x: x - node.x,
                        y: y - node.y
                    };
                }
            } else if (edge) {
                if (e.shiftKey) {
                    // Shift+click: toggle edge selection
                    if (this.selectedEdges.has(edge)) {
                        this.selectedEdges.delete(edge);
                    } else {
                        this.selectedEdges.add(edge);
                    }
                } else {
                    // Regular click: select only this edge
                    this.selectedNodes.clear();
                    this.selectedEdges.clear();
                    this.selectedEdges.add(edge);
                }
            } else {
                // Check if clicking within the bounds of selected nodes
                const clickedInSelectedArea = this.isClickInSelectedArea(x, y);
                
                console.log('Click on empty space:', {
                    x, y,
                    clickedInSelectedArea,
                    selectedNodesCount: this.selectedNodes.size,
                    selectedNodes: Array.from(this.selectedNodes).map(n => n.id)
                });
                
                if (clickedInSelectedArea && this.selectedNodes.size > 0) {
                    // Click within selected area - start dragging all selected nodes
                    console.log('Clicking within selected area - starting drag of all nodes');
                    this.isDragging = true;
                    // Find the closest selected node to use as drag start
                    let closestNode = null;
                    let closestDistance = Infinity;
                    for (const node of this.selectedNodes) {
                        const distance = Math.sqrt((x - node.x) ** 2 + (y - node.y) ** 2);
                        if (distance < closestDistance) {
                            closestDistance = distance;
                            closestNode = node;
                        }
                    }
                    this.dragStartNode = closestNode;
                    this.dragOffset = {
                        x: x - closestNode.x,
                        y: y - closestNode.y
                    };
                } else {
                    // Click on empty space
                    console.log('Clicking on empty space - clearing selection and starting marquee');
                    if (!e.shiftKey) {
                        this.selectedNodes.clear();
                        this.selectedEdges.clear();
                    }
                    
                    // Start marquee selection
                    this.isMarqueeSelecting = true;
                    this.marqueeStart = { x, y };
                    this.marqueeEnd = { x, y };
                    this.marqueeDirection = 'right'; // Will be updated on first move
                }
            }
        }
        
        this.updateSelectedNodesInfo();
        this.render();
    }

    handleMouseMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left - this.panX) / this.zoom;
        const y = (e.clientY - rect.top - this.panY) / this.zoom;
        
        if (this.isPanning) {
            // Handle panning
            const deltaX = e.clientX - this.panStart.x;
            const deltaY = e.clientY - this.panStart.y;
            this.panX += deltaX;
            this.panY += deltaY;
            this.panStart = { x: e.clientX, y: e.clientY };
            this.render();
            return;
        }
        
        if (this.isDragging && this.selectedNodes.size > 0) {
            // Move all selected nodes based on the drag start node
            if (this.dragStartNode) {
                // Calculate how much the drag start node has moved
                const newDragStartX = x - this.dragOffset.x;
                const newDragStartY = y - this.dragOffset.y;
                const deltaX = newDragStartX - this.dragStartNode.x;
                const deltaY = newDragStartY - this.dragStartNode.y;
                
                // Apply the same movement to all selected nodes
                for (const node of this.selectedNodes) {
                    node.x += deltaX;
                    node.y += deltaY;
                }
            }
            this.render();
        } else if (this.isMarqueeSelecting) {
            // Update marquee selection and determine direction
            this.marqueeEnd = { x, y };
            
            // Determine direction based on drag direction
            if (x < this.marqueeStart.x) {
                this.marqueeDirection = 'left'; // Intersecting selection
            } else {
                this.marqueeDirection = 'right'; // Contained selection
            }
            
            this.render();
        }
        
        this.lastMouseX = x;
        this.lastMouseY = y;
    }

    handleGlobalMouseMove(e) {
        if (this.isMarqueeSelecting) {
            const rect = this.canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            // Check if mouse is outside canvas
            if (x < 0 || x > rect.width || y < 0 || y > rect.height) {
                this.marqueeEnd = { x, y };
                
                // Determine direction based on drag direction
                if (x < this.marqueeStart.x) {
                    this.marqueeDirection = 'left'; // Intersecting selection
                } else {
                    this.marqueeDirection = 'right'; // Contained selection
                }
                
                this.render();
            }
        }
    }

    handleMouseUp(e) {
        if (this.isMarqueeSelecting) {
            this.finishMarqueeSelection();
            this.isMarqueeSelecting = false;
            this.render(); // Re-render to hide the marquee box
        }
        
        this.isDragging = false;
        this.dragStartNode = null; // Reset drag start node
        
        if (this.isPanning) {
            this.isPanning = false;
            this.canvas.style.cursor = this.getCursorForTool(this.currentTool);
        }
    }

    handleGlobalMouseUp(e) {
        if (this.isMarqueeSelecting) {
            this.finishMarqueeSelection();
            this.isMarqueeSelecting = false;
            this.render();
        }
        
        this.isDragging = false;
        this.dragStartNode = null; // Reset drag start node
        
        if (this.isPanning) {
            this.isPanning = false;
            this.canvas.style.cursor = this.getCursorForTool(this.currentTool);
        }
    }

    addNode(x, y) {
        // Hard limit of 50 nodes total
        if (this.nodes.size >= 50) {
            this.updateStatus('Maximum of 50 nodes allowed');
            return;
        }
        
        const id = `node_${Date.now()}`;
        const node = {
            id: id,
            x: x,
            y: y,
            label: `Node ${this.nodes.size + 1}`,
            color: '#0066cc',
            radius: 20
        };
        this.nodes.set(id, node);
        
        // Create edge to last created node if it exists
        if (this.lastCreatedNode) {
            this.addEdge(this.lastCreatedNode, node);
        }
        
        this.lastCreatedNode = node;
        this.updateStatus(`Node placed successfully (${this.nodes.size} total nodes)`);
        this.render();
    }

    addEdge(node1, node2) {
        const edgeId = `${node1.id}_${node2.id}`;
        const reverseEdgeId = `${node2.id}_${node1.id}`;
        
        // Check if edge already exists
        if (this.edges.some(edge => edge.id === edgeId || edge.id === reverseEdgeId)) {
            return;
        }
        
        const edge = {
            id: edgeId,
            from: node1.id,
            to: node2.id
        };
        this.edges.push(edge);
        this.render();
    }

    getNodeAt(x, y) {
        for (const node of this.nodes.values()) {
            const dx = x - node.x;
            const dy = y - node.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance <= node.radius) {
                return node;
            }
        }
        return null;
    }

    getEdgeAt(x, y) {
        for (const edge of this.edges) {
            const node1 = this.nodes.get(edge.from);
            const node2 = this.nodes.get(edge.to);
            
            if (node1 && node2) {
                const distance = this.pointToLineDistance(x, y, node1.x, node1.y, node2.x, node2.y);
                if (distance <= 5) { // 5 pixel tolerance
                    return edge;
                }
            }
        }
        return null;
    }

    pointToLineDistance(px, py, x1, y1, x2, y2) {
        const A = px - x1;
        const B = py - y1;
        const C = x2 - x1;
        const D = y2 - y1;

        const dot = A * C + B * D;
        const lenSq = C * C + D * D;
        
        if (lenSq === 0) return Math.sqrt(A * A + B * B);
        
        let param = dot / lenSq;
        
        let xx, yy;
        if (param < 0) {
            xx = x1;
            yy = y1;
        } else if (param > 1) {
            xx = x2;
            yy = y2;
        } else {
            xx = x1 + param * C;
            yy = y1 + param * D;
        }

        const dx = px - xx;
        const dy = py - yy;
        return Math.sqrt(dx * dx + dy * dy);
    }

    render() {
        // Clear with canvas background color
        this.ctx.fillStyle = '#2a2a2a';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Apply zoom and pan transformations
        this.ctx.save();
        this.ctx.translate(this.panX, this.panY);
        this.ctx.scale(this.zoom, this.zoom);
        
        // Draw edges first (so they appear behind nodes)
        for (const edge of this.edges) {
            const node1 = this.nodes.get(edge.from);
            const node2 = this.nodes.get(edge.to);
            
            if (node1 && node2) {
                this.ctx.strokeStyle = this.selectedEdges.has(edge) ? '#ffffff' : '#666666';
                this.ctx.lineWidth = this.selectedEdges.has(edge) ? 3 : 2;
                this.ctx.beginPath();
                this.ctx.moveTo(node1.x, node1.y);
                this.ctx.lineTo(node2.x, node2.y);
                this.ctx.stroke();
            }
        }
        
        // Draw nodes
        for (const node of this.nodes.values()) {
            this.drawNode(node);
        }
        
        // Draw marquee selection box
        if (this.isMarqueeSelecting) {
            this.drawMarqueePreview();
        }
        
        this.ctx.restore();
    }

    drawNode(node) {
        const isSelected = this.selectedNodes.has(node);
        
        // Draw node circle
        this.ctx.beginPath();
        this.ctx.arc(node.x, node.y, node.radius, 0, 2 * Math.PI);
        this.ctx.fillStyle = node.color;
        this.ctx.fill();
        
        // Draw selection border
        if (isSelected) {
            this.ctx.strokeStyle = '#ffffff';
            this.ctx.lineWidth = 3;
            this.ctx.stroke();
        }
        
        // Draw node label
        this.ctx.fillStyle = this.getContrastingTextColor(node.color);
        this.ctx.font = '14px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(node.label, node.x, node.y);
    }

    getContrastingTextColor(backgroundColor) {
        // Convert hex to RGB
        const hex = backgroundColor.replace('#', '');
        const r = parseInt(hex.substr(0, 2), 16);
        const g = parseInt(hex.substr(2, 2), 16);
        const b = parseInt(hex.substr(4, 2), 16);
        
        // Calculate luminance
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        
        return luminance > 0.5 ? '#000000' : '#ffffff';
    }

    finishMarqueeSelection() {
        const minX = Math.min(this.marqueeStart.x, this.marqueeEnd.x);
        const maxX = Math.max(this.marqueeStart.x, this.marqueeEnd.x);
        const minY = Math.min(this.marqueeStart.y, this.marqueeEnd.y);
        const maxY = Math.max(this.marqueeStart.y, this.marqueeEnd.y);
        
        if (this.marqueeDirection === 'right') {
            this.selectContainedInMarquee(minX, minY, maxX, maxY);
        } else {
            this.selectIntersectingWithMarquee(minX, minY, maxX, maxY);
        }
    }

    selectContainedInMarquee(minX, minY, maxX, maxY) {
        // Select nodes fully contained within marquee (entire circle must be inside)
        for (const node of this.nodes.values()) {
            if (this.nodeFullyContainedInMarquee(node, minX, minY, maxX, maxY)) {
                this.selectedNodes.add(node);
            }
        }
        
        // Select edges that intersect with marquee
        for (const edge of this.edges) {
            const node1 = this.nodes.get(edge.from);
            const node2 = this.nodes.get(edge.to);
            if (node1 && node2 && this.edgeIntersectsMarquee(node1, node2, minX, minY, maxX, maxY)) {
                this.selectedEdges.add(edge);
            }
        }
        
        this.updateSelectedNodesInfo();
    }

    selectIntersectingWithMarquee(minX, minY, maxX, maxY) {
        // Select nodes that intersect with marquee (any part of circle touches)
        for (const node of this.nodes.values()) {
            if (this.nodeIntersectsMarquee(node, minX, minY, maxX, maxY)) {
                this.selectedNodes.add(node);
            }
        }
        
        // Select edges that intersect with marquee
        for (const edge of this.edges) {
            const node1 = this.nodes.get(edge.from);
            const node2 = this.nodes.get(edge.to);
            if (node1 && node2 && this.edgeIntersectsMarquee(node1, node2, minX, minY, maxX, maxY)) {
                this.selectedEdges.add(edge);
            }
        }
        
        this.updateSelectedNodesInfo();
    }

    edgeIntersectsMarquee(node1, node2, minX, minY, maxX, maxY) {
        // Check if edge intersects with marquee rectangle
        const x1 = node1.x, y1 = node1.y;
        const x2 = node2.x, y2 = node2.y;
        
        // Check if any of the four corners of the marquee are on the edge
        const corners = [
            [minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY]
        ];
        
        for (const [cx, cy] of corners) {
            const distance = this.pointToLineDistance(cx, cy, x1, y1, x2, y2);
            if (distance <= 5) return true; // 5 pixel tolerance
        }
        
        // Check if edge intersects with any of the four sides of the marquee
        return this.linesIntersect(x1, y1, x2, y2, minX, minY, maxX, minY) ||
               this.linesIntersect(x1, y1, x2, y2, maxX, minY, maxX, maxY) ||
               this.linesIntersect(x1, y1, x2, y2, maxX, maxY, minX, maxY) ||
               this.linesIntersect(x1, y1, x2, y2, minX, maxY, minX, minY);
    }

    linesIntersect(x1, y1, x2, y2, x3, y3, x4, y4) {
        const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
        if (denom === 0) return false;
        
        const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
        const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;
        
        return t >= 0 && t <= 1 && u >= 0 && u <= 1;
    }

    handleKeyDown(e) {
        if (e.key === 'Delete' || e.key === 'Backspace') {
            // Delete selected nodes
            for (const node of this.selectedNodes) {
                this.deleteNode(node);
            }
            
            // Delete selected edges
            for (const edge of this.selectedEdges) {
                this.deleteEdge(edge);
            }
            
            this.selectedNodes.clear();
            this.selectedEdges.clear();
            this.updateSelectedNodesInfo();
            this.render();
        }
    }

    deleteNode(node) {
        this.nodes.delete(node.id);
        this.edges = this.edges.filter(edge => edge.from !== node.id && edge.to !== node.id);
    }

    deleteEdge(edge) {
        this.edges = this.edges.filter(e => e !== edge);
    }

    updateSelectedNodes() {
        if (this.selectedNodes.size === 0) return;
        
        const nodeName = document.getElementById('nodeName');
        const nodeColor = document.getElementById('nodeColor');
        
        // Get the current values from the input fields
        const newName = nodeName.value;
        const newColor = nodeColor.value;
        
        // Update all selected nodes with the new values
        for (const node of this.selectedNodes) {
            if (this.selectedNodes.size === 1) {
                node.label = newName;
            }
            node.color = newColor;
        }
        
        this.render();
    }

    updateSelectedNodesInfo() {
        const panel = document.getElementById('nodePropertiesPanel');
        const info = document.getElementById('selectedNodesInfo');
        
        if (this.selectedNodes.size > 0 || this.selectedEdges.size > 0) {
            panel.style.display = 'block';
            
            let text = '';
            if (this.selectedNodes.size > 0) {
                text += `${this.selectedNodes.size} node${this.selectedNodes.size > 1 ? 's' : ''} selected`;
            }
            if (this.selectedEdges.size > 0) {
                if (text) text += ', ';
                text += `${this.selectedEdges.size} edge${this.selectedEdges.size > 1 ? 's' : ''} selected`;
            }
            
            info.textContent = text;
            
            // Update input fields with selected node properties
            this.updateInputFields();
        } else {
            panel.style.display = 'none';
            info.textContent = 'No selection';
        }
    }

    updateInputFields() {
        const nodeName = document.getElementById('nodeName');
        const nodeColor = document.getElementById('nodeColor');
        
        if (this.selectedNodes.size === 1) {
            const node = Array.from(this.selectedNodes)[0];
            nodeName.value = node.label;
            nodeColor.value = node.color;
        } else if (this.selectedNodes.size > 1) {
            // For multiple nodes, show empty fields
            nodeName.value = '';
            nodeColor.value = '#0066cc';
        }
    }

    drawMarqueePreview() {
        const minX = Math.min(this.marqueeStart.x, this.marqueeEnd.x);
        const maxX = Math.max(this.marqueeStart.x, this.marqueeEnd.x);
        const minY = Math.min(this.marqueeStart.y, this.marqueeEnd.y);
        const maxY = Math.max(this.marqueeStart.y, this.marqueeEnd.y);
        
        // Draw marquee box
        this.ctx.strokeStyle = this.marqueeDirection === 'right' ? '#4A90E2' : '#50C878';
        this.ctx.fillStyle = this.marqueeDirection === 'right' ? 'rgba(74, 144, 226, 0.1)' : 'rgba(80, 200, 120, 0.1)';
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([5, 5]);
        
        this.ctx.fillRect(minX, minY, maxX - minX, maxY - minY);
        this.ctx.strokeRect(minX, minY, maxX - minX, maxY - minY);
        
        this.ctx.setLineDash([]);
        
        // Preview selection with white highlights
        if (this.marqueeDirection === 'right') {
            // Contained selection - highlight nodes fully contained
            for (const node of this.nodes.values()) {
                if (this.nodeFullyContainedInMarquee(node, minX, minY, maxX, maxY)) {
                    this.ctx.beginPath();
                    this.ctx.arc(node.x, node.y, node.radius, 0, 2 * Math.PI);
                    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
                    this.ctx.fill();
                }
            }
            
            // Highlight edges that intersect
            for (const edge of this.edges) {
                const node1 = this.nodes.get(edge.from);
                const node2 = this.nodes.get(edge.to);
                if (node1 && node2 && this.edgeIntersectsMarquee(node1, node2, minX, minY, maxX, maxY)) {
                    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
                    this.ctx.lineWidth = 4;
                    this.ctx.beginPath();
                    this.ctx.moveTo(node1.x, node1.y);
                    this.ctx.lineTo(node2.x, node2.y);
                    this.ctx.stroke();
                }
            }
        } else {
            // Intersecting selection - highlight nodes that intersect
            for (const node of this.nodes.values()) {
                if (this.nodeIntersectsMarquee(node, minX, minY, maxX, maxY)) {
                    this.ctx.beginPath();
                    this.ctx.arc(node.x, node.y, node.radius, 0, 2 * Math.PI);
                    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
                    this.ctx.fill();
                }
            }
            
            // Highlight edges that intersect
            for (const edge of this.edges) {
                const node1 = this.nodes.get(edge.from);
                const node2 = this.nodes.get(edge.to);
                if (node1 && node2 && this.edgeIntersectsMarquee(node1, node2, minX, minY, maxX, maxY)) {
                    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
                    this.ctx.lineWidth = 4;
                    this.ctx.beginPath();
                    this.ctx.moveTo(node1.x, node1.y);
                    this.ctx.lineTo(node2.x, node2.y);
                    this.ctx.stroke();
                }
            }
        }
    }

    nodeFullyContainedInMarquee(node, minX, minY, maxX, maxY) {
        // Check if the entire circle is within the marquee
        return (node.x - node.radius >= minX && 
                node.x + node.radius <= maxX && 
                node.y - node.radius >= minY && 
                node.y + node.radius <= maxY);
    }

    nodeIntersectsMarquee(node, minX, minY, maxX, maxY) {
        // Check if the circle intersects with the marquee rectangle
        return !(node.x + node.radius < minX || 
                 node.x - node.radius > maxX || 
                 node.y + node.radius < minY || 
                 node.y - node.radius > maxY);
    }

    isClickInSelectedArea(x, y) {
        if (this.selectedNodes.size === 0) return false;
        
        // Calculate bounding box of all selected nodes
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        
        for (const node of this.selectedNodes) {
            minX = Math.min(minX, node.x - node.radius);
            maxX = Math.max(maxX, node.x + node.radius);
            minY = Math.min(minY, node.y - node.radius);
            maxY = Math.max(maxY, node.y + node.radius);
        }
        
        // Add some padding for easier clicking
        const padding = 20;
        const isInArea = x >= minX - padding && x <= maxX + padding && y >= minY - padding && y <= maxY + padding;
        
        // Debug logging
        console.log('Click check:', {
            x, y,
            minX: minX - padding, maxX: maxX + padding,
            minY: minY - padding, maxY: maxY + padding,
            isInArea,
            selectedCount: this.selectedNodes.size
        });
        
        return isInArea;
    }

    getSelectedNodesCenter() {
        if (this.selectedNodes.size === 0) return { x: 0, y: 0 };
        
        let centerX = 0, centerY = 0;
        for (const node of this.selectedNodes) {
            centerX += node.x;
            centerY += node.y;
        }
        
        return {
            x: centerX / this.selectedNodes.size,
            y: centerY / this.selectedNodes.size
        };
    }
}

// Initialize the graph when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new SimpleNodeGraph();
});
