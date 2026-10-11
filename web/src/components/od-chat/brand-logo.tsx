/** TODO(od-chat brand): placeholder for the source app's brand logo SVG — lucide `Hexagon`, the glyph this app's OG card uses.
 *  Must stay an inline SVG drawing in currentColor so the §8.10 Loader can tint it. */
import { Hexagon } from "lucide-react";

const BrandLogo = ({ className }: { className?: string }) => <Hexagon className={className} aria-hidden />;
export default BrandLogo;
