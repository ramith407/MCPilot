import type { SVGProps } from "react";

export type IconName =
  | "overview"
  | "builder"
  | "compiler"
  | "doctor"
  | "playground"
  | "menu"
  | "close"
  | "arrow"
  | "external"
  | "check"
  | "terminal"
  | "spark";

const paths: Record<IconName, React.ReactNode> = {
  overview: <><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="4" rx="1.5" /><rect x="13.5" y="10.5" width="7" height="10" rx="1.5" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" /></>,
  builder: <><path d="M12 3.5 20.5 8v8L12 20.5 3.5 16V8L12 3.5Z" /><path d="m3.8 8.2 8.2 4.6 8.2-4.6M12 12.8v7.4M8 5.7l8.5 4.7" /></>,
  compiler: <><path d="m8 7-5 5 5 5M16 7l5 5-5 5M14 4l-4 16" /></>,
  doctor: <><path d="M12 3.5 20 7v5.2c0 4.3-3.1 7-8 8.8-4.9-1.8-8-4.5-8-8.8V7l8-3.5Z" /><path d="M12 8v5M12 16h.01" /></>,
  playground: <><rect x="3.5" y="4" width="17" height="16" rx="2.5" /><path d="m8 10 2.5 2.5L8 15M13 15h3" /></>,
  menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
  close: <><path d="m6 6 12 12M18 6 6 18" /></>,
  arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
  external: <><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5" /></>,
  check: <path d="m5 12 4.5 4.5L19 7" />,
  terminal: <><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><path d="m7.5 9 3 3-3 3M13.5 15h3" /></>,
  spark: <><path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2L12 3Z" /><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z" /></>,
};

export function Icon({
  name,
  ...props
}: SVGProps<SVGSVGElement> & { name: IconName }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
