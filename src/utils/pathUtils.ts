function preferredSeparator(path: string): "\\" | "/" {
  return path.includes("\\") && !path.includes("/") ? "\\" : "/";
}

export function joinPathSegment(basePath: string, segment: string): string {
  const child = segment.replace(/^[\\/]+/, "");
  if (!basePath) return child;
  if (!child) return basePath;

  const separator = preferredSeparator(basePath);
  if (/^[\\/]+$/.test(basePath)) return `${basePath[0]}${child}`;
  if (/^[A-Za-z]:[\\/]$/.test(basePath)) return `${basePath}${child}`;

  const base = basePath.replace(/[\\/]+$/, "");
  return `${base}${separator}${child}`;
}
