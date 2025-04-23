import { SVGAttributes } from 'react';

export default function AppLogoIcon(props: SVGAttributes<SVGElement>) {
    return (
        <svg
    fill="#000000"
    width="800px"
    height="800px"
    viewBox="0 0 24 24"
    id="truck"
    data-name="Line Color"
    xmlns="http://www.w3.org/2000/svg"
    className="icon line-color"
    {...props}
  >
    <path
      id="primary"
      d="M5,17H4a1,1,0,0,1-1-1V6A1,1,0,0,1,4,5h8a1,1,0,0,1,1,1V17H9"
      style={{
        fill: "none",
        stroke: "rgb(255, 0, 0)",
        strokeLinecap: "round",
        strokeLinejoin: "round",
        strokeWidth: 2,
      }}
    />
    <path
      id="primary-2"
      data-name="primary"
      d="M15,17H13V7h4.25a1,1,0,0,1,1,.73L19,10.5l1.24.31a1,1,0,0,1,.76,1V16a1,1,0,0,1-1,1H19"
      style={{
        fill: "none",
        stroke: "rgb(255, 0, 0)",
        strokeLinecap: "round",
        strokeLinejoin: "round",
        strokeWidth: 2,
      }}
    />
    <path
      id="secondary"
      d="M7,15a2,2,0,1,0,2,2A2,2,0,0,0,7,15Zm10,0a2,2,0,1,0,2,2A2,2,0,0,0,17,15Z"
      style={{
        fill: "none",
        stroke: "rgb(255, 0, 0)",
        strokeLinecap: "round",
        strokeLinejoin: "round",
        strokeWidth: 2,
      }}
    />
  </svg>
    );
}
