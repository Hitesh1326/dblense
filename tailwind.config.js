/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/webview/**/*.{ts,tsx,html}"],
  theme: {
    extend: {
      colors: {
        // Map VS Code CSS variables to Tailwind utility classes
        "vscode-foreground": "var(--vscode-foreground)",
        "vscode-editor-background": "var(--vscode-editor-background)",
        "vscode-sideBar-background": "var(--vscode-sideBar-background)",
        "vscode-panel-border": "var(--vscode-panel-border)",
        "vscode-input-background": "var(--vscode-input-background)",
        "vscode-input-foreground": "var(--vscode-input-foreground)",
        "vscode-input-border": "var(--vscode-input-border)",
        "vscode-focusBorder": "var(--vscode-focusBorder)",
        "vscode-button-background": "var(--vscode-button-background)",
        "vscode-button-foreground": "var(--vscode-button-foreground)",
        "vscode-button-hoverBackground": "var(--vscode-button-hoverBackground)",
        "vscode-badge-background": "var(--vscode-badge-background)",
        "vscode-badge-foreground": "var(--vscode-badge-foreground)",
        "vscode-list-activeSelectionBackground": "var(--vscode-list-activeSelectionBackground)",
        "vscode-list-activeSelectionForeground": "var(--vscode-list-activeSelectionForeground)",
        "vscode-list-hoverBackground": "var(--vscode-list-hoverBackground)",
        "vscode-editor-inactiveSelectionBackground": "var(--vscode-editor-inactiveSelectionBackground)",
        "vscode-scrollbarSlider-background": "var(--vscode-scrollbarSlider-background)",
        "vscode-scrollbarSlider-hoverBackground": "var(--vscode-scrollbarSlider-hoverBackground)",
      },
    },
  },
  plugins: [require("@tailwindcss/forms")],
};
