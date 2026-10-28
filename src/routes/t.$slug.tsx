// EasyTaller — public page of a shop by slug (/t/:slug).
import { createFileRoute } from "@tanstack/react-router";
import { PublicBookingPage } from "@/components/public/PublicShopPage";

export const Route = createFileRoute("/t/$slug")({
  component: SlugPage,
});

function SlugPage() {
  const { slug } = Route.useParams();
  return <PublicBookingPage slug={slug} />;
}
