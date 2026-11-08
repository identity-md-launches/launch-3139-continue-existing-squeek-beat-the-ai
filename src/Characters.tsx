import type { CSSProperties } from "react";

const running = [
  ".......222........22....",
  "......23322......2332...",
  "......234422....23442...",
  "......234442222234442...",
  ".....2244444444444422...",
  "....2444444444444444442..",
  "...244444444444444444442.",
  "..2444444444444444544442.",
  ".24444444444444445554442.",
  ".24444444444444444444542.",
  ".24444444444444666666662.",
  ".2444444444444666666772..",
  "..244444444446666666662..",
  "...2444444444666666622...",
  "....2244444442222222....",
  ".....22222222..2222.....",
  "....2772......2772......",
];
const sleeping = [
  "........................",
  "........................",
  "........22222222........",
  "......224444444422......",
  ".....24444444444442.....",
  "....2444444444444442....",
  "...244444444442244442...",
  "..24444444444233444442..",
  "..24444444444234444442..",
  ".2444444444444444444442.",
  ".2444444444444444555442.",
  ".2444444444444666666662.",
  "..24444444444666666672..",
  "...244444444446666662...",
  "....2244444444444422....",
  "......222222222222......",
];
const colors: Record<string, string> = {
  "2": "#734c3d",
  "3": "#e8a099",
  "4": "#dba46d",
  "5": "#322c29",
  "6": "#ffe2b7",
  "7": "#dc8e85",
};
export function PixelHamster({
  asleep = false,
  professor = false,
  className = "",
}: {
  asleep?: boolean;
  professor?: boolean;
  className?: string;
}) {
  return (
    <svg
      className={`pixel-hamster ${className}`}
      viewBox="0 0 96 80"
      aria-hidden="true"
      shapeRendering="crispEdges"
    >
      {(asleep ? sleeping : running).flatMap((row, y) =>
        [...row].map((c, x) =>
          colors[c] ? (
            <rect
              key={`${x}-${y}`}
              x={x * 4}
              y={y * 4 + 6}
              width="4"
              height="4"
              fill={colors[c]}
            />
          ) : null,
        ),
      )}
      {professor && (
        <g fill="#343d44">
          <path d="M28 41h19v17H28zm26 0h19v17H54z" />
          <path d="M46 45h9v4h-9z" />
          <path fill="#f9edcd" d="M32 45h11v9H32zm26 0h11v9H58z" />
          <path d="M15 15h60v6H15zm12-5h36v9H27z" />
          <path fill="#e5b660" d="M65 19h3v17h-3z" />
        </g>
      )}
    </svg>
  );
}
export function WheelScene({
  health,
  asleep,
  rpm,
  paused,
}: {
  health: string;
  asleep: boolean;
  rpm: number;
  paused: boolean;
}) {
  const live = health === "live" || health === "practice";
  const running = live && !asleep && rpm > 0 && !paused;
  const style = {
    "--wheel-duration": `${Math.max(0.2, 60 / Math.max(0.01, rpm))}s`,
  } as CSSProperties;
  return (
    <div
      className={`wheel-scene ${!live ? "unknown-scene" : ""} ${paused ? "scene-paused" : ""}`}
      style={style}
    >
      <svg
        className="scene-doodles"
        viewBox="0 0 380 250"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        <g fill="none" stroke="#d9c9b9" strokeWidth="2">
          <path d="m40 65 10-3-3-10m4 11 8 7M322 170l6 7 8-7M290 42v12m-6-6h12M65 185v8m-4-4h8" />
          <circle cx="330" cy="80" r="5" />
          <path d="M33 127h14m-7-7v14" />
        </g>
        <ellipse cx="190" cy="223" rx="105" ry="7" fill="#e4d9cc" />
      </svg>
      <svg className="wheel-svg" viewBox="0 0 260 240" aria-hidden="true">
        <path
          d="m120 120-24 105h70l-24-105"
          fill="#e2c3a2"
          stroke="#8d6e56"
          strokeWidth="5"
          strokeLinejoin="round"
        />
        <g
          className={running ? "wheel-spin" : ""}
          style={{ transformOrigin: "130px 109px" }}
        >
          <circle
            cx="130"
            cy="109"
            r="93"
            fill="#f8f1e6"
            stroke="#9a7459"
            strokeWidth="7"
          />
          <circle
            cx="130"
            cy="109"
            r="82"
            fill="none"
            stroke="#dfc8ad"
            strokeWidth="3"
            strokeDasharray="5 7"
          />
          {[0, 60, 120, 180, 240, 300].map((d) => (
            <path
              key={d}
              d="M130 109v-90"
              transform={`rotate(${d} 130 109)`}
              stroke="#dfc8ad"
              strokeWidth="3"
            />
          ))}
          <circle cx="130" cy="109" r="9" fill="#b99472" />
        </g>
        <path
          d="M88 229h86"
          stroke="#8d6e56"
          strokeWidth="6"
          strokeLinecap="round"
        />
      </svg>
      {live ? (
        <div className={`scene-hamster ${running ? "hamster-run" : ""}`}>
          <PixelHamster asleep={asleep} />
        </div>
      ) : (
        <div className="unknown-mark" aria-hidden="true">
          ?
        </div>
      )}
      {live && asleep && (
        <div className="sleep-z" aria-hidden="true">
          z<span>z</span>
          <span>z</span>
        </div>
      )}
      <div className="scene-name">Squeektoshi’s wheel</div>
    </div>
  );
}
