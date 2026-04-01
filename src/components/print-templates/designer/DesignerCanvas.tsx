import { useState, useRef, useCallback, useEffect } from "react";
import { type DesignElement, type TemplateDesign, GRID_SIZE, SNAP_THRESHOLD } from "./types";
import { renderElementContent } from "./CanvasElementRenderer";
import { Trash2 } from "lucide-react";

interface Props {
  design: TemplateDesign;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, dir: 'up' | 'down') => void;
  onUpdateElement: (id: string, updates: Partial<DesignElement>) => void;
  logoBase64: string | null;
  companyName: string;
}

const PAGE_W = 595;

interface SnapGuide {
  type: 'h' | 'v';
  pos: number;
}

interface DragState {
  elId: string;
  startMouseX: number;
  startMouseY: number;
  startElX: number;
  startElY: number;
  zone: string;
}

interface ResizeState {
  elId: string;
  handle: string; // 'nw'|'ne'|'sw'|'se'|'n'|'s'|'e'|'w'
  startMouseX: number;
  startMouseY: number;
  startX: number;
  startY: number;
  startW: number;
  startH: number;
}

const ZONE_LABELS: Record<string, string> = { header: 'الترويسة', body: 'المحتوى', footer: 'التذييل' };

const snap = (val: number): number => Math.round(val / GRID_SIZE) * GRID_SIZE;

const DesignerCanvas = ({ design, selectedId, onSelect, onRemove, onMove, onUpdateElement, logoBase64, companyName }: Props) => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [resize, setResize] = useState<ResizeState | null>(null);
  const [guides, setGuides] = useState<SnapGuide[]>([]);
  const [scale, setScale] = useState(1);

  const zones: ('header' | 'body' | 'footer')[] = ['header', 'body', 'footer'];
  const bodyHeight = Math.max(500, 842 - design.zones.header.height - design.zones.footer.height);

  const getZoneHeight = (zone: string) => {
    if (zone === 'header') return design.zones.header.height;
    if (zone === 'footer') return design.zones.footer.height;
    return bodyHeight;
  };

  const contentWidth = PAGE_W - design.page.margins.right - design.page.margins.left;

  // Calculate snap guides for an element being moved
  const calcGuides = useCallback((elId: string, x: number, y: number, w: number, h: number, zone: string): { guides: SnapGuide[]; snapX: number; snapY: number } => {
    const zoneW = contentWidth;
    const zoneH = getZoneHeight(zone);
    const centerX = zoneW / 2;
    const centerY = zoneH / 2;
    const newGuides: SnapGuide[] = [];
    let snapX = x, snapY = y;

    // Center guides
    const elCenterX = x + w / 2;
    const elCenterY = y + h / 2;
    if (Math.abs(elCenterX - centerX) < SNAP_THRESHOLD) {
      snapX = centerX - w / 2;
      newGuides.push({ type: 'v', pos: centerX });
    }
    if (Math.abs(elCenterY - centerY) < SNAP_THRESHOLD) {
      snapY = centerY - h / 2;
      newGuides.push({ type: 'h', pos: centerY });
    }

    // Edge guides: snap to other elements in same zone
    const siblings = design.elements.filter(e => e.zone === zone && e.id !== elId);
    for (const sib of siblings) {
      // Left edge alignment
      if (Math.abs(x - sib.x) < SNAP_THRESHOLD) { snapX = sib.x; newGuides.push({ type: 'v', pos: sib.x }); }
      // Right edge alignment
      if (Math.abs(x + w - (sib.x + sib.w)) < SNAP_THRESHOLD) { snapX = sib.x + sib.w - w; newGuides.push({ type: 'v', pos: sib.x + sib.w }); }
      // Top edge
      if (Math.abs(y - sib.y) < SNAP_THRESHOLD) { snapY = sib.y; newGuides.push({ type: 'h', pos: sib.y }); }
      // Bottom edge
      if (Math.abs(y + h - (sib.y + sib.h)) < SNAP_THRESHOLD) { snapY = sib.y + sib.h - h; newGuides.push({ type: 'h', pos: sib.y + sib.h }); }
    }

    return { guides: newGuides, snapX, snapY };
  }, [design.elements, contentWidth, bodyHeight]);

  // Drag handler
  useEffect(() => {
    if (!drag) return;
    const onMouseMove = (e: MouseEvent) => {
      const dx = (e.clientX - drag.startMouseX) / scale;
      const dy = (e.clientY - drag.startMouseY) / scale;
      let newX = snap(drag.startElX + dx);
      let newY = snap(drag.startElY + dy);
      
      const el = design.elements.find(el => el.id === drag.elId);
      if (!el) return;

      const { guides: g, snapX, snapY } = calcGuides(drag.elId, newX, newY, el.w, el.h, drag.zone);
      newX = snapX;
      newY = snapY;
      setGuides(g);
      onUpdateElement(drag.elId, { x: newX, y: newY });
    };
    const onMouseUp = () => {
      setDrag(null);
      setGuides([]);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => { window.removeEventListener('mousemove', onMouseMove); window.removeEventListener('mouseup', onMouseUp); };
  }, [drag, scale, calcGuides]);

  // Resize handler
  useEffect(() => {
    if (!resize) return;
    const onMouseMove = (e: MouseEvent) => {
      const dx = (e.clientX - resize.startMouseX) / scale;
      const dy = (e.clientY - resize.startMouseY) / scale;
      let { startX: x, startY: y, startW: w, startH: h } = resize;
      const handle = resize.handle;

      if (handle.includes('e')) w = snap(Math.max(20, resize.startW + dx));
      if (handle.includes('w')) { w = snap(Math.max(20, resize.startW - dx)); x = snap(resize.startX + (resize.startW - w)); }
      if (handle.includes('s')) h = snap(Math.max(16, resize.startH + dy));
      if (handle.includes('n')) { h = snap(Math.max(16, resize.startH - dy)); y = snap(resize.startY + (resize.startH - h)); }

      onUpdateElement(resize.elId, { x, y, w, h });
    };
    const onMouseUp = () => setResize(null);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => { window.removeEventListener('mousemove', onMouseMove); window.removeEventListener('mouseup', onMouseUp); };
  }, [resize, scale]);

  // Keyboard controls
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!selectedId) return;
      const el = design.elements.find(el => el.id === selectedId);
      if (!el) return;
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        onRemove(selectedId);
        return;
      }
      const step = e.shiftKey ? 10 : 1;
      if (e.key === 'ArrowLeft') { e.preventDefault(); onUpdateElement(selectedId, { x: el.x - step }); }
      if (e.key === 'ArrowRight') { e.preventDefault(); onUpdateElement(selectedId, { x: el.x + step }); }
      if (e.key === 'ArrowUp') { e.preventDefault(); onUpdateElement(selectedId, { y: el.y - step }); }
      if (e.key === 'ArrowDown') { e.preventDefault(); onUpdateElement(selectedId, { y: el.y + step }); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedId, design.elements]);

  const startDrag = (e: React.MouseEvent, el: DesignElement) => {
    e.stopPropagation();
    e.preventDefault();
    onSelect(el.id);
    setDrag({ elId: el.id, startMouseX: e.clientX, startMouseY: e.clientY, startElX: el.x, startElY: el.y, zone: el.zone });
  };

  const startResize = (e: React.MouseEvent, elId: string, handle: string) => {
    e.stopPropagation();
    e.preventDefault();
    const el = design.elements.find(el => el.id === elId);
    if (!el) return;
    setResize({ elId, handle, startMouseX: e.clientX, startMouseY: e.clientY, startX: el.x, startY: el.y, startW: el.w, startH: el.h });
  };

  const handles = ['nw', 'ne', 'sw', 'se', 'n', 's', 'e', 'w'];
  const handlePos = (h: string): React.CSSProperties => {
    const size = 8;
    const half = -size / 2;
    const base: React.CSSProperties = { position: 'absolute', width: size, height: size, background: 'hsl(var(--primary))', border: '1px solid white', zIndex: 20 };
    if (h === 'nw') return { ...base, top: half, left: half, cursor: 'nw-resize' };
    if (h === 'ne') return { ...base, top: half, right: half, cursor: 'ne-resize' };
    if (h === 'sw') return { ...base, bottom: half, left: half, cursor: 'sw-resize' };
    if (h === 'se') return { ...base, bottom: half, right: half, cursor: 'se-resize' };
    if (h === 'n') return { ...base, top: half, left: '50%', marginLeft: half, cursor: 'n-resize' };
    if (h === 's') return { ...base, bottom: half, left: '50%', marginLeft: half, cursor: 's-resize' };
    if (h === 'e') return { ...base, top: '50%', right: half, marginTop: half, cursor: 'e-resize' };
    if (h === 'w') return { ...base, top: '50%', left: half, marginTop: half, cursor: 'w-resize' };
    return base;
  };

  return (
    <div className="flex-1 overflow-auto bg-muted/50 p-6 flex justify-center" onClick={() => onSelect(null)} tabIndex={0}>
      <div
        ref={canvasRef}
        style={{
          width: PAGE_W,
          minHeight: 842,
          background: design.theme.pageBackground || '#FFFFFF',
          boxShadow: '0 2px 12px rgba(0,0,0,0.12)',
          fontFamily: `'${design.theme.fontFamily}', sans-serif`,
          direction: design.page.direction,
          position: 'relative',
          overflow: 'hidden',
          transform: `scale(${scale})`,
          transformOrigin: 'top center',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Watermark */}
        {design.theme.watermark.enabled && logoBase64 && (
          <div style={{
            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            opacity: design.theme.watermark.opacity, zIndex: 0, pointerEvents: 'none',
            width: '60%', textAlign: 'center',
          }}>
            <img src={logoBase64} alt="" style={{ width: '100%', objectFit: 'contain' }} />
          </div>
        )}

        <div style={{ position: 'relative', zIndex: 1 }}>
          {zones.map(zone => {
            const zoneElements = design.elements.filter(e => e.zone === zone);
            const zoneH = getZoneHeight(zone);
            const zoneStyle = zone === 'header' ? design.zones.header : zone === 'footer' ? design.zones.footer : null;
            return (
              <div
                key={zone}
                style={{
                  position: 'relative',
                  height: zoneH,
                  background: zoneStyle?.background || 'transparent',
                  paddingLeft: design.page.margins.left,
                  paddingRight: design.page.margins.right,
                  overflow: 'visible',
                }}
              >
                {/* Zone label */}
                <div
                  style={{
                    position: 'absolute', top: 2, right: 4,
                    fontSize: 9, color: 'rgba(156,163,175,0.5)',
                    pointerEvents: 'none', userSelect: 'none', zIndex: 30,
                  }}
                >
                  {ZONE_LABELS[zone]}
                </div>

                {/* Zone content area (relative container for absolute elements) */}
                <div style={{ position: 'relative', width: contentWidth, height: '100%' }}>
                  {/* Snap guides */}
                  {guides.map((g, i) => (
                    <div
                      key={i}
                      style={{
                        position: 'absolute',
                        ...(g.type === 'v'
                          ? { left: g.pos, top: 0, width: 1, height: '100%', borderLeft: '1px dashed hsl(var(--primary) / 0.5)' }
                          : { top: g.pos, left: 0, height: 1, width: '100%', borderTop: '1px dashed hsl(var(--primary) / 0.5)' }),
                        pointerEvents: 'none', zIndex: 25,
                      }}
                    />
                  ))}

                  {/* Center guides (always shown faintly) */}
                  <div style={{ position: 'absolute', left: contentWidth / 2, top: 0, width: 0, height: '100%', borderLeft: '1px dashed rgba(156,163,175,0.15)', pointerEvents: 'none' }} />

                  {/* Elements */}
                  {zoneElements.map(el => {
                    const isSelected = selectedId === el.id;
                    return (
                      <div
                        key={el.id}
                        onMouseDown={e => startDrag(e, el)}
                        style={{
                          position: 'absolute',
                          left: el.x,
                          top: el.y,
                          width: el.w,
                          height: el.h,
                          cursor: drag?.elId === el.id ? 'grabbing' : 'grab',
                          outline: isSelected ? '2px solid hsl(var(--primary))' : undefined,
                          outlineOffset: 1,
                          zIndex: isSelected ? 15 : 10,
                          userSelect: 'none',
                        }}
                      >
                        {/* Hover border */}
                        {!isSelected && (
                          <div
                            style={{
                              position: 'absolute', inset: -1,
                              border: '1px solid transparent',
                              pointerEvents: 'none',
                            }}
                            className="group-hover:border-primary/30"
                          />
                        )}

                        {renderElementContent(el, design, logoBase64, companyName)}

                        {/* Resize handles */}
                        {isSelected && handles.map(h => (
                          <div
                            key={h}
                            style={handlePos(h)}
                            onMouseDown={e => startResize(e, el.id, h)}
                          />
                        ))}

                        {/* Delete button */}
                        {isSelected && (
                          <button
                            onClick={e => { e.stopPropagation(); onRemove(el.id); }}
                            style={{
                              position: 'absolute', top: -12, left: -12,
                              width: 20, height: 20, borderRadius: 4,
                              background: 'hsl(var(--destructive))',
                              color: 'white',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              border: 'none', cursor: 'pointer', zIndex: 30,
                              fontSize: 10,
                            }}
                          >
                            <Trash2 style={{ width: 12, height: 12 }} />
                          </button>
                        )}

                        {/* Size label */}
                        {isSelected && (
                          <div style={{
                            position: 'absolute', bottom: -16, left: '50%', transform: 'translateX(-50%)',
                            fontSize: 9, color: 'hsl(var(--muted-foreground))', whiteSpace: 'nowrap',
                            background: 'hsl(var(--card))', padding: '0 4px', borderRadius: 2, zIndex: 30,
                          }}>
                            {Math.round(el.w)}×{Math.round(el.h)} @ ({Math.round(el.x)},{Math.round(el.y)})
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Zone border */}
                {zone !== 'body' && (
                  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 1, background: 'rgba(156,163,175,0.2)' }} />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default DesignerCanvas;
