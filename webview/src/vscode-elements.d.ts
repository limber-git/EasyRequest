import type React from "react";

declare global {
  namespace JSX {
    interface IntrinsicElements {
      "vscode-button": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        appearance?: "primary" | "secondary" | "icon" | "outline" | "subtle";
      };
    }
  }
}

export {};
