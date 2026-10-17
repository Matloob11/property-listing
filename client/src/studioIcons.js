import commercial from "./studio/commercial.jpg";
import rental from "./studio/rental.jpg";
import residential from "./studio/residential.jpg";
import sale from "./studio/sale.jpg";

export const STUDIO_ICONS = {
  residential,
  commercial,
  rent: rental,
  sale,
};

export function warmStudioIcons() {
  Object.values(STUDIO_ICONS).forEach((src) => {
    const img = new Image();
    img.src = src;
  });
}

warmStudioIcons();
