import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { Mail, MapPin } from "lucide-react";
import { SiteHeader, SiteFooter } from "@/components/site-header";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact TP-CAMP — Trinidad & Tobago Label Services" },
      {
        name: "description",
        content:
          "Talk to the TP-CAMP team about rights administration, distribution, campaign operations or label finance. Based in Trinidad and Tobago, serving artists worldwide.",
      },
      { property: "og:title", content: "Contact TP-CAMP" },
      {
        property: "og:description",
        content: "Questions about TP-CAMP OneSuite, rights administration or label services? Send us a note.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ContactPage,
});

const schema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  email: z.string().trim().email("Enter a valid email").max(255),
  subject: z.string().trim().max(150).optional(),
  message: z.string().trim().min(1, "Message is required").max(2000),
});

function ContactPage() {
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const parsed = schema.safeParse({
      name: formData.get("name"),
      email: formData.get("email"),
      subject: formData.get("subject") || undefined,
      message: formData.get("message"),
    });

    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }

    setSubmitting(true);
    const { error } = await supabase.from("contact_messages").insert(parsed.data);
    setSubmitting(false);

    if (error) {
      toast.error("Message could not be sent. Please try again.");
      return;
    }

    toast.success("Thanks — we'll be in touch shortly.");
    form.reset();
  }

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-5 pt-16 pb-16">
        <p className="eyebrow">Contact</p>
        <h1 className="mt-4 text-4xl font-semibold sm:text-5xl">Let's talk about your catalogue</h1>
        <p className="mt-5 max-w-2xl text-lg text-muted-foreground">
          Tell us what you're working on and how you plan to use TP-CAMP OneSuite. We respond to every
          enquiry.
        </p>

        <div className="mt-10 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <form onSubmit={handleSubmit} className="panel space-y-4 p-7">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="text-muted-foreground">Name</span>
                <input
                  name="name"
                  required
                  maxLength={100}
                  className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-accent"
                />
              </label>
              <label className="block text-sm">
                <span className="text-muted-foreground">Email</span>
                <input
                  name="email"
                  type="email"
                  required
                  maxLength={255}
                  className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-accent"
                />
              </label>
            </div>
            <label className="block text-sm">
              <span className="text-muted-foreground">Subject</span>
              <input
                name="subject"
                maxLength={150}
                className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-accent"
              />
            </label>
            <label className="block text-sm">
              <span className="text-muted-foreground">Message</span>
              <textarea
                name="message"
                required
                rows={6}
                maxLength={2000}
                className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-accent"
              />
            </label>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center justify-center rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {submitting ? "Sending…" : "Send message"}
            </button>
          </form>

          <aside className="panel space-y-5 p-7 text-sm text-muted-foreground">
            <div>
              <MapPin className="h-5 w-5 text-accent" />
              <h2 className="mt-3 text-base font-semibold text-foreground">Based in</h2>
              <p className="mt-1">Trinidad and Tobago — serving the Caribbean and the world.</p>
            </div>
            <div>
              <Mail className="h-5 w-5 text-accent" />
              <h2 className="mt-3 text-base font-semibold text-foreground">Enquiries</h2>
              <p className="mt-1">
                Rights administration, distribution, publishing, campaigns and label finance.
              </p>
            </div>
          </aside>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
