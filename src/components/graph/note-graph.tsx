'use client';

import React, { useMemo, useRef, useEffect, useState } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { forceCollide, forceRadial } from 'd3-force';


interface Note {
    id: string;
    title: string;
    content: string; // HTML content
    updatedAt: string | number;
}

interface NoteGraphProps {
    notes: Note[];
    onNodeClick: (nodeId: string) => void;
    onNodeHover?: (nodeId: string | null) => void;
    highlightedNodeId?: string | null;
    className?: string;
}

export default function NoteGraph({ notes, onNodeClick, onNodeHover, highlightedNodeId, className = '' }: NoteGraphProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const fgRef = useRef<any>(null);
    const isInitialLoad = useRef(true);
    const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

    // Highlight state
    const [highlightNodes, setHighlightNodes] = useState(new Set<string>());
    const [highlightLinks, setHighlightLinks] = useState(new Set<string>());
    const [hoverNode, setHoverNode] = useState<string | null>(null);

    // Use Ref to store persistent node state (x, y, vx, vy, etc.)
    const persistentNodes = useRef<Map<string, any>>(new Map());
    const [isLocked, setIsLocked] = useState(false);

    // Theme colors state - reactive to theme changes
    const [themeColors, setThemeColors] = useState({
        bgColor: '#0f172a',
        linkColor: '#475569',
        highlightLinkColor: '#60a5fa',
        linkDimmedColor: '#1e293b',
        textColor: '#e2e8f0'
    });

    // Watch for theme changes
    useEffect(() => {
        const updateThemeColors = () => {
            const getCssVar = (name: string): string => {
                if (typeof window === 'undefined') return '';
                return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
            };

            setThemeColors({
                bgColor: getCssVar('--graph-bg') || '#0f172a',
                linkColor: getCssVar('--graph-link') || '#475569',
                highlightLinkColor: getCssVar('--graph-link-highlight') || '#60a5fa',
                linkDimmedColor: getCssVar('--graph-link-dimmed') || '#1e293b',
                textColor: getCssVar('--graph-text') || '#e2e8f0'
            });
        };

        // Initial update
        updateThemeColors();

        // Watch for class changes on html element (theme toggle)
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                    // Small delay to ensure CSS variables are updated
                    setTimeout(updateThemeColors, 50);
                }
            });
        });

        observer.observe(document.documentElement, { attributes: true });

        return () => observer.disconnect();
    }, []);

    // Compute graph data
    const { graphData, neighborMap, nodeMap } = useMemo(() => {
        const extractTitle = (content: string): string => {
            // Handle HTML and extract first line
            if (!content) return 'Untitled';

            // Strip HTML tags correctly
            const text = content
                .replace(/<\/(p|h[1-6]|div|li)>/gi, '\n')
                .replace(/<br\s*\/?>/gi, '\n')
                .replace(/<[^>]*>/g, '')
                .trim();

            const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
            return lines[0]?.slice(0, 60) || 'Untitled';
        };

        const nodes = notes.map(n => {
            const existingNode = persistentNodes.current.get(n.id);
            const title = extractTitle(n.content);

            // Create a node object. If it existed before, preserve its layout properties.
            const node = {
                id: n.id,
                name: title,
                val: 1,
                color: '#3b82f6',
                group: 0,
                tags: [] as string[],
                // Preserve layout if available
                ...(existingNode || {})
            };

            // Update the map for next time
            persistentNodes.current.set(n.id, node);
            return node;
        });

        // Cleanup nodes no longer in props
        const currentIds = new Set(notes.map(n => n.id));
        for (const [id] of persistentNodes.current) {
            if (!currentIds.has(id)) {
                persistentNodes.current.delete(id);
            }
        }

        const links: Array<{ source: string; target: string }> = [];
        const nodeIds = new Set(nodes.map(n => n.id));
        const nodeLookup = new Map(nodes.map(n => [n.id, n]));
        const neighbors = new Map<string, Set<string>>();

        // ... rest of logic for links and tags ...
        // (Simplified here for the replacement, but I will include the full logic)

        const tagRegex = /#([\w\u0590-\u05ff\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff\u3040-\u309f\u30a0-\u30ff\u4e00-\u9fff\uac00-\ud7af]+)/g;
        const palette = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#a855f7', '#ec4899'];
        const tagColorMap = new Map<string, string>();
        let tagColorIndex = 0;

        if (typeof window !== 'undefined') {
            const parser = new DOMParser();
            notes.forEach(sourceNote => {
                const n = nodeLookup.get(sourceNote.id);
                if (!n) return;

                const matches = sourceNote.content.match(tagRegex);
                if (matches) {
                    const uniqueTags = Array.from(new Set(matches.map(t => t.substring(1))));
                    n.tags = uniqueTags;
                    const firstTag = uniqueTags[0];
                    if (!tagColorMap.has(firstTag)) {
                        tagColorMap.set(firstTag, palette[tagColorIndex % palette.length]);
                        tagColorIndex++;
                    }
                    n.color = tagColorMap.get(firstTag)!;
                }

                const doc = parser.parseFromString(sourceNote.content, 'text/html');
                const linkElements = doc.querySelectorAll('.wiki-link');
                linkElements.forEach(el => {
                    const targetId = el.getAttribute('data-id');
                    if (targetId && nodeIds.has(targetId)) {
                        const exists = links.some(l => l.source === sourceNote.id && l.target === targetId);
                        if (!exists) {
                            links.push({ source: sourceNote.id, target: targetId });
                            if (!neighbors.has(sourceNote.id)) neighbors.set(sourceNote.id, new Set());
                            if (!neighbors.has(targetId)) neighbors.set(targetId, new Set());
                            neighbors.get(sourceNote.id)?.add(targetId);
                            neighbors.get(targetId)?.add(sourceNote.id);
                        }
                    }
                });
            });
        }

        const connectivity = new Map<string, number>();
        links.forEach(l => {
            connectivity.set(l.source, (connectivity.get(l.source) || 0) + 1);
            connectivity.set(l.target, (connectivity.get(l.target) || 0) + 1);
        });

        nodes.forEach(n => {
            const degree = connectivity.get(n.id) || 0;
            n.val = 1 + (degree * 3);
        });

        return { graphData: { nodes, links }, neighborMap: neighbors, nodeMap: nodeLookup };
    }, [notes]);

    // Use a reference to track if the topology actually changed
    const prevTopology = useRef<string>('');

    useEffect(() => {
        const currentTopology = JSON.stringify({
            nodes: graphData.nodes.map(n => n.id).sort(),
            links: graphData.links.map(l => `${l.source}-${l.target}`).sort()
        });

        if (currentTopology !== prevTopology.current) {
            prevTopology.current = currentTopology;
            if (fgRef.current && !isLocked) {
                // Only reheat if structure changed and not locked
                fgRef.current.d3ReheatSimulation();
            }
        }
    }, [graphData, isLocked]);

    // Configure Forces
    useEffect(() => {
        if (fgRef.current) {
            const graph = fgRef.current;
            // Repulsion (Expansion) - Keep nodes apart
            graph.d3Force('charge').strength(-150).distanceMax(600);

            // Link (Spring) - Pull connected nodes together
            graph.d3Force('link').distance(50);

            // Collision - Prevent overlap
            graph.d3Force('collide', forceCollide((node: any) => Math.sqrt(node.val) * 4 + 6));

            // Gravity (Obsidian-like) - Pull everything gently to center
            // This prevents "flying away" and keeps the graph compact
            graph.d3Force('gravity', forceRadial(0, 0, 0).strength(0.15));

            // Center of Mass - Hard constraint to keep viewport centered
            graph.d3Force('center').x(0).y(0);
        }
    }, [graphData]);

    // Immediately zoom to fit all nodes on mount and when graph data changes
    useEffect(() => {
        if (fgRef.current && graphData.nodes.length > 0) {
            // Wait for 2 frames to ensure the canvas is fully laid out and measured
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    if (fgRef.current) {
                        // Instant zoom (0ms duration) with padding
                        fgRef.current.zoomToFit(0, 50);
                    }
                });
            });
        }
    }, [graphData.nodes.length, dimensions.width, dimensions.height]);

    // ... rest of the render logic ...
    const toggleLock = () => {
        setIsLocked(!isLocked);
        if (fgRef.current) {
            if (!isLocked) {
                // About to lock: stop simulation
                fgRef.current.pauseAnimation();
            } else {
                // About to unlock: resume
                fgRef.current.resumeAnimation();
                fgRef.current.d3ReheatSimulation();
            }
        }
    };

    // Reusable highlight logic
    const updateHighlights = (nodeId: string | null) => {
        setHoverNode(nodeId);
        if (nodeId) {
            const newHighlights = new Set<string>();
            const newLinkHighlights = new Set<string>();

            newHighlights.add(nodeId);
            const neighbors = neighborMap.get(nodeId);
            neighbors?.forEach(neighborId => newHighlights.add(neighborId));

            // Find links
            graphData.links.forEach((link: any) => {
                const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
                const targetId = typeof link.target === 'object' ? link.target.id : link.target;

                if (sourceId === nodeId || targetId === nodeId) {
                    newLinkHighlights.add(link);
                }
            });

            setHighlightNodes(newHighlights);
            setHighlightLinks(newLinkHighlights);
        } else {
            setHighlightNodes(new Set());
            setHighlightLinks(new Set());
        }
    };

    // Handle Hover (Internal)
    const handleNodeHover = (node: any) => {
        const nodeId = node ? node.id : null;
        if (hoverNode === nodeId) return;

        updateHighlights(nodeId);
        if (onNodeHover) onNodeHover(nodeId);
    };

    // Handle External Highlight Prop
    useEffect(() => {
        if (highlightedNodeId !== undefined) {
            // Only update if different to avoid loop if prop updates on hover
            if (highlightedNodeId !== hoverNode) {
                updateHighlights(highlightedNodeId);
            }
        }
    }, [highlightedNodeId, hoverNode, graphData]);

    // Resize handler
    useEffect(() => {
        const updateDimensions = () => {
            if (containerRef.current) {
                setDimensions({
                    width: containerRef.current.clientWidth,
                    height: containerRef.current.clientHeight
                });
            }
        };

        const resizeObserver = new ResizeObserver(updateDimensions);
        if (containerRef.current) resizeObserver.observe(containerRef.current);
        updateDimensions();

        return () => resizeObserver.disconnect();
    }, []);

    // Destructure theme colors for use in render
    const { bgColor, linkColor, highlightLinkColor, linkDimmedColor, textColor } = themeColors;

    return (
        <div ref={containerRef} className={`relative w-full h-full ${className}`} style={{ backgroundColor: 'var(--graph-bg)' }}>
            <ForceGraph2D
                ref={fgRef}
                width={dimensions.width}
                height={dimensions.height}
                graphData={graphData}
                backgroundColor={bgColor}
                nodeColor={(node: any) => node.color}
                linkColor={(link: any) => {
                    if (highlightLinks.has(link)) return highlightLinkColor; // Highlighted
                    if (hoverNode) return linkDimmedColor; // Dimmed
                    return linkColor;
                }}
                nodeLabel="name"
                nodeRelSize={6}
                linkDirectionalParticles={(link: any) => highlightLinks.has(link) ? 4 : 0}
                linkDirectionalParticleWidth={2}
                linkDirectionalParticleSpeed={0.005}
                linkWidth={(link: any) => highlightLinks.has(link) ? 2 : 1}
                onNodeClick={(node: any) => onNodeClick(node.id)}
                onNodeHover={handleNodeHover}
                onNodeDragEnd={(node: any) => {
                    node.fx = null;
                    node.fy = null;
                }}
                warmupTicks={100} // Pre-calculate 100 ticks of physics before rendering
                onEngineStop={() => {
                    isInitialLoad.current = false;
                }}
                d3AlphaDecay={0.02}
                d3VelocityDecay={0.3}
                nodeCanvasObject={(node: any, ctx, globalScale) => {
                    const isHovered = hoverNode ? highlightNodes.has(node.id) : true;
                    const opacity = hoverNode ? (isHovered ? 1 : 0.2) : 1;

                    ctx.globalAlpha = opacity;

                    const r = Math.sqrt(Math.max(0, node.val || 1)) * 4;
                    ctx.beginPath();
                    ctx.arc(node.x, node.y, r, 0, 2 * Math.PI, false);
                    ctx.fillStyle = node.color;
                    ctx.fill();

                    // Highlight Ring for active node
                    if (node.id === hoverNode) {
                        ctx.lineWidth = 2 / globalScale;
                        ctx.strokeStyle = '#fff';
                        ctx.stroke();
                    }

                    // Label
                    const label = node.name;
                    const fontSize = 12 / globalScale;
                    ctx.font = `${fontSize}px Sans-Serif`;
                    ctx.fillStyle = textColor;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(label, node.x, node.y + r + fontSize);

                    ctx.globalAlpha = 1; // Reset
                }}
            />
        </div>
    );
}
