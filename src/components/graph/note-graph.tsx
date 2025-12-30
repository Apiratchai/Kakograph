'use client';

import React, { useMemo, useRef, useEffect, useState } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { forceCollide } from 'd3-force';


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

    // Compute graph data
    const { graphData, neighborMap, nodeMap } = useMemo(() => {
        const extractTitle = (content: string): string => {
            const withLineBreaks = content
                .replace(/<\/(p|h[1-6]|div|li)>/gi, '\n')
                .replace(/<br\s*\/?>/gi, '\n');
            const text = withLineBreaks.replace(/<[^>]*>/g, '').trim();
            const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
            return lines[0]?.slice(0, 60) || 'Untitled';
        };

        const nodes = notes.map(n => ({
            id: n.id,
            name: extractTitle(n.content),
            val: 1, // Size base
            color: '#3b82f6', // Default blue
            group: 0,
            tags: [] as string[]
        }));

        const links: Array<{ source: string; target: string }> = [];
        const nodeIds = new Set(nodes.map(n => n.id));
        const nodeMap = new Map(nodes.map(n => [n.id, n]));
        const neighbors = new Map<string, Set<string>>(); // Adjacency list

        // Tag extraction regex
        const tagRegex = /#([\w\u0590-\u05ff\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff\u3040-\u309f\u30a0-\u30ff\u4e00-\u9fff\uac00-\ud7af]+)/g;
        const tagColorMap = new Map<string, string>();
        const palette = [
            '#ef4444', // Red 500
            '#f97316', // Orange 500
            '#eab308', // Yellow 500
            '#22c55e', // Green 500
            '#06b6d4', // Cyan 500
            '#3b82f6', // Blue 500
            '#a855f7', // Purple 500
            '#ec4899', // Pink 500
        ];
        let tagColorIndex = 0;

        // Parse links and tags to build adjacency list
        if (typeof window !== 'undefined') {
            const parser = new DOMParser();

            notes.forEach(sourceNote => {
                const n = nodeMap.get(sourceNote.id);
                if (!n) return;

                // 1. Extract Tags
                const matches = sourceNote.content.match(tagRegex);
                if (matches) {
                    const uniqueTags = Array.from(new Set(matches.map(t => t.substring(1)))); // remove #
                    n.tags = uniqueTags;

                    // Assign color based on first tag
                    const firstTag = uniqueTags[0];
                    if (!tagColorMap.has(firstTag)) {
                        tagColorMap.set(firstTag, palette[tagColorIndex % palette.length]);
                        tagColorIndex++;
                    }
                    n.color = tagColorMap.get(firstTag)!;
                }

                // 2. Extract Links
                const doc = parser.parseFromString(sourceNote.content, 'text/html');
                const linkElements = doc.querySelectorAll('.wiki-link');

                linkElements.forEach(el => {
                    const targetId = el.getAttribute('data-id');
                    if (targetId && nodeIds.has(targetId)) {
                        const exists = links.some(l => l.source === sourceNote.id && l.target === targetId);
                        if (!exists) {
                            links.push({
                                source: sourceNote.id,
                                target: targetId
                            });

                            // Build neighbor map (undirected for visual highlight)
                            if (!neighbors.has(sourceNote.id)) neighbors.set(sourceNote.id, new Set());
                            if (!neighbors.has(targetId)) neighbors.set(targetId, new Set());
                            neighbors.get(sourceNote.id)?.add(targetId);
                            neighbors.get(targetId)?.add(sourceNote.id);
                        }
                    }
                });
            });
        }

        // 1. Calculate Degree Centrality for Size
        const connectivity = new Map<string, number>();
        links.forEach(l => {
            connectivity.set(l.source, (connectivity.get(l.source) || 0) + 1);
            connectivity.set(l.target, (connectivity.get(l.target) || 0) + 1);
        });

        // Increase size multiplier
        nodes.forEach(n => {
            const degree = connectivity.get(n.id) || 0;
            n.val = 1 + (degree * 3);
        });

        // 2. Find Connected Components for Coloring (Fallback if no tags)
        const adjacency = new Map<string, string[]>();
        nodes.forEach(n => adjacency.set(n.id, []));
        links.forEach(l => {
            adjacency.get(l.source)?.push(l.target);
            adjacency.get(l.target)?.push(l.source);
        });

        const visited = new Set<string>();
        let groupIndex = 0;

        nodes.forEach(node => {
            if (!visited.has(node.id)) {
                // Start BFS/DFS for this component
                const queue = [node.id];
                visited.add(node.id);
                const color = palette[groupIndex % palette.length];
                groupIndex++;

                while (queue.length > 0) {
                    const currentId = queue.shift()!;
                    const n = nodeMap.get(currentId);

                    if (n && (!n.tags || n.tags.length === 0)) {
                        n.color = color;
                        n.group = groupIndex;
                    }

                    const neighbors = adjacency.get(currentId) || [];
                    for (const neighborId of neighbors) {
                        if (!visited.has(neighborId)) {
                            visited.add(neighborId);
                            queue.push(neighborId);
                        }
                    }
                }
            }
        });

        return { graphData: { nodes, links }, neighborMap: neighbors, nodeMap };
    }, [notes]);

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
    }, [highlightedNodeId, hoverNode, graphData]); // graphData dependency ensures correct link calculation if data changes

    // Re-enable fit on data change
    useEffect(() => {
        isInitialLoad.current = true;
    }, [graphData]);

    // Configure Forces
    useEffect(() => {
        if (fgRef.current) {
            const graph = fgRef.current;
            graph.d3Force('charge').strength(-100);
            graph.d3Force('link').distance(40);
            graph.d3Force('collide', forceCollide((node: any) => Math.sqrt(node.val) * 4 + 2));
            graph.d3Force('center').strength(0.5);
            graph.d3ReheatSimulation();
        }
    }, [graphData]);

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

        window.addEventListener('resize', updateDimensions);
        updateDimensions();
        setTimeout(updateDimensions, 300);

        return () => window.removeEventListener('resize', updateDimensions);
    }, []);

    // Theme colors
    const bgColor = '#0f172a';
    const linkColor = '#475569';
    const highlightLinkColor = '#60a5fa'; // Brighter blue
    const textColor = '#e2e8f0';

    return (
        <div ref={containerRef} className={`w-full h-full ${className}`}>
            <ForceGraph2D
                ref={fgRef}
                width={dimensions.width}
                height={dimensions.height}
                graphData={graphData}
                backgroundColor={bgColor}
                nodeColor={(node: any) => node.color}
                linkColor={(link: any) => {
                    if (highlightLinks.has(link)) return highlightLinkColor; // Highlighted
                    if (hoverNode) return '#1e293b'; // Dimmed
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
                cooldownTicks={100}
                onEngineStop={() => {
                    if (isInitialLoad.current) {
                        fgRef.current.zoomToFit(400, 50);
                        isInitialLoad.current = false;
                    }
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
