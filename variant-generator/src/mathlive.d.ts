import type { MathfieldElement } from "mathlive";
import type React from "react";

declare module "react/jsx-runtime" {
  namespace JSX {
    interface IntrinsicElements {
      "math-field": React.DetailedHTMLProps<
        React.HTMLAttributes<MathfieldElement>,
        MathfieldElement
      > & {
        class?: string;
        "default-mode"?: "math" | "text" | "latex";
        "math-virtual-keyboard-policy"?: "auto" | "manual" | "sandboxed";
        "smart-fence"?: string;
        "smart-mode"?: string;
      };
    }
  }
}
