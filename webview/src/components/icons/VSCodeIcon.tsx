type IconName = "chevron" | "folder" | "folder-open" | "new-file" | "new-folder" | "trash" | "copy" | "check";

interface VSCodeIconProps {
  name: IconName;
  className?: string;
  title?: string;
}

const paths: Record<Exclude<IconName, "chevron">, string> = {
  folder: "M1.5 3.5h5l1.4 1.7H14.5v7.3H1.5V3.5Zm1.2 1.2v6.6h10.6V6.4H7.4L6 4.7H2.7Z",
  "folder-open": "M1.5 4h5l1.3 1.5h6.7v1.2H7.3L6 8H1.5V4Zm.7 5.2h4.3L7.8 7.9h5.9l-1.2 4H2.2l.7-2.7Z",
  "new-file": "M3 1.5h6L13 5.4v9.1H3V1.5Zm5.5 1.2v3.2h3.1L8.5 2.7ZM7.4 8.1v1.6H5.8v1.2h1.6v1.6h1.2v-1.6h1.6V9.7H8.6V8.1H7.4Z",
  "new-folder": "M1.5 3.5h5l1.3 1.6h6.7v7.4H1.5V3.5Zm1.2 1.2v6.6h10.6V6.3H7.2L5.9 4.7H2.7Zm5.2 2.2v1.4H6.5v1.1h1.4v1.4H9V9.4h1.4V8.3H9V6.9H7.9Z",
  trash: "M5.1 2h5.8l.6 1.2h2v1.2H2.5V3.2h2L5.1 2Zm-1 3.5h7.8l-.6 8H4.7l-.6-8Zm2 1.2.2 5.6h1.2L7.3 6.7H6.1Zm2.4 0 .2 5.6h1.2l.2-5.6H8.5Z",
  copy: "M5 2h7.5v9H11v-1.5h.3V3.5H5V2Zm-2 3h7.5v9H3V5Zm1.2 1.2v6.6h5.1V6.2H4.2Z",
  check: "M6.3 12.2 2 7.9l1.1-1.1 3.2 3.2L13 3.3l1.1 1.1-7.8 7.8Z"
};

export function VSCodeIcon({ name, className = "", title }: VSCodeIconProps): JSX.Element {
  if (name === "chevron") {
    return <span className={`vscode-icon vscode-icon-chevron ${className}`} title={title} aria-hidden="true" />;
  }
  return (
    <svg className={`vscode-icon ${className}`} viewBox="0 0 16 16" focusable="false" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  );
}
