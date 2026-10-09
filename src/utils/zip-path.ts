/** Resolves a relationship target (like "../media/image1.png") against the folder of the part that points to it. */
export function resolveZipPath(baseDir: string, target: string): string {
  const raw = target.startsWith("/") ? target.slice(1) : `${baseDir}${baseDir && !baseDir.endsWith("/") ? "/" : ""}${target}`;
  const out: string[] = [];
  for (const part of raw.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return out.join("/");
}

/** "ppt/slides/slide1.xml" -> "ppt/slides/". */
export function dirOf(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? "" : path.slice(0, slash + 1);
}

/** "ppt/slides/slide1.xml" -> "ppt/slides/_rels/slide1.xml.rels". */
export function relsPathFor(path: string): string {
  const slash = path.lastIndexOf("/");
  return `${path.slice(0, slash + 1)}_rels/${path.slice(slash + 1)}.rels`;
}
