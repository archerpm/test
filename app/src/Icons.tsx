import type { ReactNode } from "react";

const base = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, focusable: false } as const;
const I = ({ children, size = 20 }: { children: ReactNode; size?: number }) => <svg {...base} width={size} height={size}>{children}</svg>;

export const Check = (p: { size?: number }) => <I {...p}><path d="M5 12.5l4.5 4.5L19 7.5" /></I>;
export const Help = (p: { size?: number }) => <I {...p}><circle cx="12" cy="12" r="9" /><path d="M9.6 9.4a2.5 2.5 0 114 2c-.9.6-1.6 1.1-1.6 2.1" /><path d="M12 17.2h.01" /></I>;
export const Clock = (p: { size?: number }) => <I {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></I>;
export const Minus = (p: { size?: number }) => <I {...p}><path d="M6 12h12" /></I>;
export const Chevron = (p: { size?: number }) => <I {...p}><path d="M7 10l5 5 5-5" /></I>;
export const External = (p: { size?: number }) => <I {...p}><path d="M14 4h6v6" /><path d="M20 4l-9 9" /><path d="M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5" /></I>;
export const Calendar = (p: { size?: number }) => <I {...p}><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16M9 3v4M15 3v4" /></I>;
export const Info = (p: { size?: number }) => <I {...p}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></I>;
export const Shield = (p: { size?: number }) => <I {...p}><path d="M12 3l7 3v5.5c0 4.2-2.9 7.6-7 9.5-4.1-1.9-7-5.3-7-9.5V6l7-3z" /><path d="M9 12l2.2 2.2L15.5 10" /></I>;
export const Doc = (p: { size?: number }) => <I {...p}><path d="M7 3h7l4 4v13a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z" /><path d="M14 3v4h4M9 12h6M9 16h6" /></I>;
export const Lock = (p: { size?: number }) => <I {...p}><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" /></I>;
export const Link = (p: { size?: number }) => <I {...p}><path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 00-5.7 0l-3 3A4 4 0 0011 18.7l1-1" /></I>;
