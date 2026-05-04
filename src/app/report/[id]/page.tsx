import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/db";

/**
 * Bare customer-facing report URL — `/report/<orderId>`.
 *
 * The hosted, fully-styled report lives at `/report/<orderId>/print`
 * (single source of truth for both screen viewing and Puppeteer PDF
 * rendering). This page exists so the bare URL doesn't 404 if a
 * customer trims `/print` off the link in their email.
 *
 * Auth: order ID is the access token (25-char cuid, ~120 bits).
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = {
  title: "GEO Audit Report",
  robots: { index: false, follow: false },
};

export default async function ReportPage({
  params,
}: {
  params: { id: string };
}) {
  const order = await prisma.auditOrder.findUnique({
    where: { id: params.id },
    select: { id: true, reportMarkdown: true },
  });
  if (!order) notFound();
  if (!order.reportMarkdown) notFound();

  redirect(`/report/${encodeURIComponent(order.id)}/print`);
}
