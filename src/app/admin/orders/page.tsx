import { redirect } from "next/navigation";

/**
 * Canonical alias for the admin orders table.
 *
 * The orders content + login form live at `src/app/admin/page.tsx`.
 * This route exists so the canonical URL `/admin/orders` resolves
 * without a 404. Future cleanup could move the content here and
 * turn `/admin` into a hub; for now this redirect is the minimum
 * surface that makes `/admin/orders` a working route.
 */
export default function AdminOrdersPage(): never {
  redirect("/admin");
}
