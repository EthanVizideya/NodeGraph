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
        this.isMouseOverCanvas = false;
        this.explodingNodes = [];
        this.isExploding = false;
        this.explosionStartTime = 0;
        
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
        
        // Bottom buttons
        document.getElementById('saveBtn').addEventListener('click', () => this.saveGraph());
        document.getElementById('loadBtn').addEventListener('click', () => this.loadGraph());
        document.getElementById('exportBtn').addEventListener('click', () => this.exportGraph());
        document.getElementById('clearBtn').addEventListener('click', () => this.clearReset());
        
        // Node property updates - automatic on input change
        document.getElementById('nodeName').addEventListener('input', () => this.updateSelectedNodes());
        document.getElementById('nodeColor').addEventListener('input', () => this.updateSelectedNodes());

        // Canvas events
        this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.handleMouseUp(e));
        this.canvas.addEventListener('wheel', (e) => this.handleWheel(e));
        this.canvas.addEventListener('mouseenter', () => this.handleMouseEnter());
        this.canvas.addEventListener('mouseleave', () => this.handleMouseLeave());
        
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
                    this.marqueeStartScreenX = e.clientX - rect.left; // Store screen X for direction detection
                    this.marqueeDirection = 'right'; // Will be updated on first move
                }
            }
        }
        
        this.updateSelectedNodesInfo();
        this.render();
    }

    handleMouseEnter() {
        this.isMouseOverCanvas = true;
    }

    handleMouseLeave() {
        this.isMouseOverCanvas = false;
        this.updateCoordinateDisplay();
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
            
            // Determine direction based on drag direction (use screen coordinates for consistency)
            const rect = this.canvas.getBoundingClientRect();
            const screenX = e.clientX - rect.left;
            if (screenX < this.marqueeStartScreenX) {
                this.marqueeDirection = 'left'; // Intersecting selection
            } else {
                this.marqueeDirection = 'right'; // Contained selection
            }
            
            this.render();
        }
        
        this.lastMouseX = x;
        this.lastMouseY = y;
        
        // Update coordinate display
        this.updateCoordinateDisplay(x, y);
    }

    handleGlobalMouseMove(e) {
        if (this.isMarqueeSelecting) {
            const rect = this.canvas.getBoundingClientRect();
            const screenX = e.clientX - rect.left;
            const screenY = e.clientY - rect.top;
            
            // Check if mouse is outside canvas
            if (screenX < 0 || screenX > rect.width || screenY < 0 || screenY > rect.height) {
                // Transform screen coordinates to canvas coordinates (accounting for zoom and pan)
                const x = (screenX - this.panX) / this.zoom;
                const y = (screenY - this.panY) / this.zoom;
                
                this.marqueeEnd = { x, y };
                
                // Determine direction based on drag direction (use original screen coordinates for direction)
                if (screenX < this.marqueeStartScreenX) {
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
        
        // Draw edges first (so they appear behind nodes) - only if not exploding
        if (!this.isExploding) {
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
        }
        
        // Draw nodes (only if not exploding)
        if (!this.isExploding) {
            for (const node of this.nodes.values()) {
                this.drawNode(node);
            }
        }
        
        // Draw exploding particles
        if (this.isExploding) {
            this.drawExplodingParticles();
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

    drawExplodingParticles() {
        for (const particle of this.explodingNodes) {
            this.ctx.save();
            this.ctx.globalAlpha = particle.life;
            this.ctx.fillStyle = particle.color;
            this.ctx.beginPath();
            this.ctx.arc(particle.x, particle.y, particle.size, 0, 2 * Math.PI);
            this.ctx.fill();
            this.ctx.restore();
        }
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
            this.updateStatus(`Contained selection: ${this.selectedNodes.size} nodes, ${this.selectedEdges.size} edges`);
        } else {
            this.selectIntersectingWithMarquee(minX, minY, maxX, maxY);
            this.updateStatus(`Intersecting selection: ${this.selectedNodes.size} nodes, ${this.selectedEdges.size} edges`);
        }
    }

    selectContainedInMarquee(minX, minY, maxX, maxY) {
        // Select nodes fully contained within marquee (entire circle must be inside)
        for (const node of this.nodes.values()) {
            if (this.nodeFullyContainedInMarquee(node, minX, minY, maxX, maxY)) {
                this.selectedNodes.add(node);
            }
        }
        
        // Select edges that are fully contained within marquee (both endpoints inside)
        for (const edge of this.edges) {
            const node1 = this.nodes.get(edge.from);
            const node2 = this.nodes.get(edge.to);
            if (node1 && node2 && this.edgeFullyContainedInMarquee(node1, node2, minX, minY, maxX, maxY)) {
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
        
        // Select edges that intersect with marquee (at least one endpoint inside OR line intersects)
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
        
        // First check if either endpoint is inside the marquee
        const p1Inside = (x1 >= minX && x1 <= maxX && y1 >= minY && y1 <= maxY);
        const p2Inside = (x2 >= minX && x2 <= maxX && y2 >= minY && y2 <= maxY);
        
        if (p1Inside || p2Inside) {
            return true;
        }
        
        // Check if edge intersects with any of the four sides of the marquee
        return this.linesIntersect(x1, y1, x2, y2, minX, minY, maxX, minY) ||
               this.linesIntersect(x1, y1, x2, y2, maxX, minY, maxX, maxY) ||
               this.linesIntersect(x1, y1, x2, y2, maxX, maxY, minX, maxY) ||
               this.linesIntersect(x1, y1, x2, y2, minX, maxY, minX, minY);
    }
    
    edgeFullyContainedInMarquee(node1, node2, minX, minY, maxX, maxY) {
        // Check if both endpoints of the edge are inside the marquee
        const x1 = node1.x, y1 = node1.y;
        const x2 = node2.x, y2 = node2.y;
        
        const p1Inside = (x1 >= minX && x1 <= maxX && y1 >= minY && y1 <= maxY);
        const p2Inside = (x2 >= minX && x2 <= maxX && y2 >= minY && y2 <= maxY);
        
        return p1Inside && p2Inside;
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
        this.ctx.fillStyle = this.marqueeDirection === 'right' ? 'rgba(74, 144, 226, 0.05)' : 'rgba(80, 200, 120, 0.05)';
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([5, 5]);
        
        this.ctx.fillRect(minX, minY, maxX - minX, maxY - minY);
        this.ctx.strokeRect(minX, minY, maxX - minX, maxY - minY);
        
        // Add mode indicator on top
        const modeText = this.marqueeDirection === 'right' ? 'CONTAINED' : 'INTERSECTING';
        this.ctx.fillStyle = this.marqueeDirection === 'right' ? '#4A90E2' : '#50C878';
        this.ctx.font = 'bold 12px Arial';
        this.ctx.textAlign = 'left';
        this.ctx.textBaseline = 'top';
        this.ctx.fillText(modeText, minX + 5, minY + 5);
        
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
            
            // Highlight edges that are fully contained
            for (const edge of this.edges) {
                const node1 = this.nodes.get(edge.from);
                const node2 = this.nodes.get(edge.to);
                if (node1 && node2 && this.edgeFullyContainedInMarquee(node1, node2, minX, minY, maxX, maxY)) {
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

    updateCoordinateDisplay(x, y) {
        const coordinateText = document.getElementById('coordinateText');
        
        if (this.isMouseOverCanvas && x !== undefined && y !== undefined) {
            // Show cursor coordinates
            coordinateText.textContent = `X: ${Math.round(x)}, Y: ${Math.round(y)}`;
        } else {
            // Show center coordinates
            const canvasWidth = this.canvas.width / window.devicePixelRatio;
            const canvasHeight = this.canvas.height / window.devicePixelRatio;
            const centerX = (canvasWidth / 2 - this.panX) / this.zoom;
            const centerY = (canvasHeight / 2 - this.panY) / this.zoom;
            coordinateText.textContent = `X: ${Math.round(centerX)}, Y: ${Math.round(centerY)}`;
        }
    }

    clearReset() {
        if (this.isExploding) return; // Prevent multiple explosions
        
        // Start explosion animation
        this.startExplosion();
    }

    startExplosion() {
        this.isExploding = true;
        this.explosionStartTime = Date.now();
        this.explodingNodes = [];
        
        // Create exploding particles for each node
        for (const node of this.nodes.values()) {
            const numParticles = 8 + Math.random() * 8; // 8-16 particles per node
            for (let i = 0; i < numParticles; i++) {
                const angle = (Math.PI * 2 * i) / numParticles + Math.random() * 0.5;
                const speed = 2 + Math.random() * 4; // Random speed
                const size = 3 + Math.random() * 6; // Random particle size
                
                this.explodingNodes.push({
                    x: node.x,
                    y: node.y,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    color: node.color,
                    size: size,
                    life: 1.0,
                    decay: 0.02 + Math.random() * 0.03
                });
            }
        }
        
        // Create exploding particles for each edge
        for (const edge of this.edges) {
            const node1 = this.nodes.get(edge.from);
            const node2 = this.nodes.get(edge.to);
            
            if (node1 && node2) {
                // Calculate edge length and direction
                const dx = node2.x - node1.x;
                const dy = node2.y - node1.y;
                const length = Math.sqrt(dx * dx + dy * dy);
                const numParticles = Math.max(3, Math.floor(length / 20)); // More particles for longer edges
                
                for (let i = 0; i < numParticles; i++) {
                    // Position particles along the edge
                    const t = i / (numParticles - 1);
                    const x = node1.x + dx * t;
                    const y = node1.y + dy * t;
                    
                    // Random direction perpendicular to edge + some randomness
                    const perpAngle = Math.atan2(dy, dx) + Math.PI / 2 + (Math.random() - 0.5) * Math.PI;
                    const speed = 1 + Math.random() * 3; // Slightly slower than node particles
                    const size = 2 + Math.random() * 4; // Smaller than node particles
                    
                    this.explodingNodes.push({
                        x: x,
                        y: y,
                        vx: Math.cos(perpAngle) * speed,
                        vy: Math.sin(perpAngle) * speed,
                        color: '#666666', // Gray color for edges
                        size: size,
                        life: 1.0,
                        decay: 0.015 + Math.random() * 0.025 // Slightly slower decay
                    });
                }
            }
        }
        
        // Start animation loop
        this.animateExplosion();
    }

    animateExplosion() {
        if (!this.isExploding) return;
        
        const currentTime = Date.now();
        const elapsed = currentTime - this.explosionStartTime;
        
        // Update particle positions
        for (let i = this.explodingNodes.length - 1; i >= 0; i--) {
            const particle = this.explodingNodes[i];
            
            // Update position
            particle.x += particle.vx;
            particle.y += particle.vy;
            
            // Apply gravity (slight downward pull)
            particle.vy += 0.1;
            
            // Update life
            particle.life -= particle.decay;
            
            // Remove dead particles
            if (particle.life <= 0) {
                this.explodingNodes.splice(i, 1);
            }
        }
        
        this.render();
        
        // Continue animation if there are still particles or if it's been less than 2 seconds
        if (this.explodingNodes.length > 0 || elapsed < 2000) {
            requestAnimationFrame(() => this.animateExplosion());
        } else {
            // Animation finished, now clear everything
            this.finishClear();
        }
    }

    finishClear() {
        // Clear all nodes and edges
        this.nodes.clear();
        this.edges = [];
        this.selectedNodes.clear();
        this.selectedEdges.clear();
        this.lastCreatedNode = null;
        this.explodingNodes = [];
        this.isExploding = false;
        
        // Reset zoom and pan
        this.zoom = 1;
        this.panX = 0;
        this.panY = 0;
        
        // Update UI
        this.updateSelectedNodesInfo();
        this.updateCoordinateDisplay();
        this.updateStatus('Canvas cleared and reset');
        this.render();
    }

    exportGraph() {
        if (this.nodes.size === 0) {
            this.updateStatus('No nodes to export');
            return;
        }

        // Create a high-resolution canvas for export
        const exportScale = 2; // 2x resolution for high quality
        const canvasWidth = this.canvas.width / window.devicePixelRatio;
        const canvasHeight = this.canvas.height / window.devicePixelRatio;
        
        const exportCanvas = document.createElement('canvas');
        exportCanvas.width = canvasWidth * exportScale;
        exportCanvas.height = canvasHeight * exportScale;
        const exportCtx = exportCanvas.getContext('2d');
        
        // Set high DPI scaling
        exportCtx.scale(exportScale, exportScale);
        
        // Fill background
        exportCtx.fillStyle = '#2a2a2a';
        exportCtx.fillRect(0, 0, canvasWidth, canvasHeight);
        
        // Apply zoom and pan transformations
        exportCtx.save();
        exportCtx.translate(this.panX, this.panY);
        exportCtx.scale(this.zoom, this.zoom);
        
        // Draw edges first
        for (const edge of this.edges) {
            const node1 = this.nodes.get(edge.from);
            const node2 = this.nodes.get(edge.to);
            
            if (node1 && node2) {
                exportCtx.strokeStyle = this.selectedEdges.has(edge) ? '#ffffff' : '#666666';
                exportCtx.lineWidth = this.selectedEdges.has(edge) ? 3 : 2;
                exportCtx.beginPath();
                exportCtx.moveTo(node1.x, node1.y);
                exportCtx.lineTo(node2.x, node2.y);
                exportCtx.stroke();
            }
        }
        
        // Draw nodes
        for (const node of this.nodes.values()) {
            this.drawNodeForExport(exportCtx, node);
        }
        
        exportCtx.restore();
        
        // Convert to blob and download
        exportCanvas.toBlob((blob) => {
            if (blob) {
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = `node-graph-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.png`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
                
                this.updateStatus(`Exported ${this.nodes.size} nodes and ${this.edges.length} edges`);
            } else {
                this.updateStatus('Export failed');
            }
        }, 'image/png');
    }

    drawNodeForExport(ctx, node) {
        const isSelected = this.selectedNodes.has(node);
        
        // Draw node circle
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, 2 * Math.PI);
        ctx.fillStyle = node.color;
        ctx.fill();
        
        // Draw selection border
        if (isSelected) {
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 3;
            ctx.stroke();
        }
        
        // Draw node label
        ctx.fillStyle = this.getContrastingTextColor(node.color);
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(node.label, node.x, node.y);
    }

    saveGraph() {
        if (this.nodes.size === 0) {
            this.updateStatus('No graph to save');
            return;
        }

        const graphData = {
            nodes: Array.from(this.nodes.values()),
            edges: this.edges,
            zoom: this.zoom,
            panX: this.panX,
            panY: this.panY,
            version: '1.0',
            timestamp: new Date().toISOString()
        };

        const dataStr = JSON.stringify(graphData, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/vnd.vizideya.nodegraph' });
        
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `vizideya-graph-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.vng`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        this.updateStatus(`Saved ${this.nodes.size} nodes and ${this.edges.length} edges as .vng file`);
    }

    loadGraph() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.vng,.json';
        input.style.display = 'none';
        
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const graphData = JSON.parse(e.target.result);
                    
                    // Validate the data structure
                    if (!graphData.nodes || !Array.isArray(graphData.nodes) || !Array.isArray(graphData.edges)) {
                        this.updateStatus('Invalid graph file format');
                        return;
                    }

                    // Clear current graph
                    this.nodes.clear();
                    this.edges = [];
                    this.selectedNodes.clear();
                    this.selectedEdges.clear();
                    this.lastCreatedNode = null;

                    // Load nodes
                    for (const nodeData of graphData.nodes) {
                        this.nodes.set(nodeData.id, nodeData);
                    }

                    // Load edges
                    this.edges = graphData.edges || [];

                    // Load view settings
                    this.zoom = graphData.zoom || 1;
                    this.panX = graphData.panX || 0;
                    this.panY = graphData.panY || 0;

                    // Update UI
                    this.updateSelectedNodesInfo();
                    this.updateCoordinateDisplay();
                    this.updateStatus(`Loaded ${this.nodes.size} nodes and ${this.edges.length} edges`);
                    this.render();
                } catch (error) {
                    this.updateStatus('Error loading graph file');
                    console.error('Load error:', error);
                }
            };
            reader.readAsText(file);
        };

        document.body.appendChild(input);
        input.click();
        document.body.removeChild(input);
    }
}

// Initialize the graph when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new SimpleNodeGraph();
});
