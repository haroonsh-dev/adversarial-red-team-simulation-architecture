"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Loader2, X } from "lucide-react";
import { easeOut } from "@/lib/motionPresets";
import { LogoIcon } from "@/components/shared/Logo";
import { toast } from "@/lib/stores/toast";

const COMPANY_SIZES = [
  "1–50",
  "51–200",
  "201–1,000",
  "1,001–5,000",
  "5,000+",
] as const;

const INTERESTS = [
  "Runtime containment",
  "Red-team / evals",
  "Enterprise SSO & VPC",
  "Compliance exports",
  "Multi-agent pipelines",
] as const;

export interface ContactSalesFormValues {
  firstName: string;
  lastName: string;
  workEmail: string;
  company: string;
  jobTitle: string;
  companySize: string;
  interest: string;
  message: string;
}

const EMPTY: ContactSalesFormValues = {
  firstName: "",
  lastName: "",
  workEmail: "",
  company: "",
  jobTitle: "",
  companySize: "",
  interest: "",
  message: "",
};

function isWorkEmail(email: string) {
  const trimmed = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return false;
  const free = ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com", "aol.com"];
  const domain = trimmed.split("@")[1];
  return Boolean(domain) && !free.includes(domain);
}

export function ContactSalesForm({
  idPrefix = "contact",
  onSuccess,
  onLogin,
  onLoginHref,
  compact = false,
}: {
  idPrefix?: string;
  onSuccess?: () => void;
  onLogin?: () => void;
  onLoginHref?: string;
  compact?: boolean;
}) {
  const [values, setValues] = useState<ContactSalesFormValues>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const set =
    (key: keyof ContactSalesFormValues) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      setValues((v) => ({ ...v, [key]: e.target.value }));
      setError(null);
    };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!values.firstName.trim() || !values.lastName.trim()) {
      setError("Please enter your first and last name.");
      return;
    }
    if (!isWorkEmail(values.workEmail)) {
      setError("Use a valid work email (personal domains are not accepted).");
      return;
    }
    if (!values.company.trim()) {
      setError("Company name is required.");
      return;
    }
    if (!values.companySize) {
      setError("Select your company size.");
      return;
    }

    setLoading(true);
    setError(null);
    await new Promise((r) => setTimeout(r, 700));
    setLoading(false);
    setDone(true);
    toast("Request received", {
      description: "An ARTSA specialist will reach out within one business day.",
    });
    onSuccess?.();
  };

  if (done) {
    return (
      <div className="flex flex-col items-center py-8 text-center">
        <CheckCircle2 className="h-10 w-10 text-[#67b3ef]" aria-hidden />
        <h3 className="mt-4 text-[24px] font-semibold leading-[1.33] tracking-[-0.5px] text-white">
          Thanks — we got your request
        </h3>
        <p className="mt-3 max-w-sm text-[16px] leading-[1.5] tracking-[-0.19px] text-[#a7a7a7]">
          A solutions engineer will email {values.workEmail.trim()} within one business day with
          next steps and a tailored demo.
        </p>
        <button
          type="button"
          className="lp-btn-secondary mt-6"
          onClick={() => {
            setDone(false);
            setValues(EMPTY);
          }}
        >
          Submit another request
        </button>
      </div>
    );
  }

  const label = "mb-1.5 block text-[14px] leading-[1.5] tracking-[-0.17px] text-[#a7a7a7]";

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4" noValidate>
      <div className={`grid gap-4 ${compact ? "sm:grid-cols-2" : "sm:grid-cols-2"}`}>
        <div>
          <label htmlFor={`${idPrefix}-first`} className={label}>
            First name
          </label>
          <input
            id={`${idPrefix}-first`}
            className="lp-modal-field"
            autoComplete="given-name"
            value={values.firstName}
            onChange={set("firstName")}
            required
          />
        </div>
        <div>
          <label htmlFor={`${idPrefix}-last`} className={label}>
            Last name
          </label>
          <input
            id={`${idPrefix}-last`}
            className="lp-modal-field"
            autoComplete="family-name"
            value={values.lastName}
            onChange={set("lastName")}
            required
          />
        </div>
      </div>

      <div>
        <label htmlFor={`${idPrefix}-email`} className={label}>
          Work email
        </label>
        <input
          id={`${idPrefix}-email`}
          type="email"
          className="lp-modal-field"
          autoComplete="email"
          placeholder="you@company.com"
          value={values.workEmail}
          onChange={set("workEmail")}
          required
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={`${idPrefix}-company`} className={label}>
            Company
          </label>
          <input
            id={`${idPrefix}-company`}
            className="lp-modal-field"
            autoComplete="organization"
            value={values.company}
            onChange={set("company")}
            required
          />
        </div>
        <div>
          <label htmlFor={`${idPrefix}-title`} className={label}>
            Job title
          </label>
          <input
            id={`${idPrefix}-title`}
            className="lp-modal-field"
            autoComplete="organization-title"
            value={values.jobTitle}
            onChange={set("jobTitle")}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={`${idPrefix}-size`} className={label}>
            Company size
          </label>
          <select
            id={`${idPrefix}-size`}
            className="lp-modal-field"
            value={values.companySize}
            onChange={set("companySize")}
            required
          >
            <option value="">Select…</option>
            {COMPANY_SIZES.map((s) => (
              <option key={s} value={s}>
                {s} employees
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${idPrefix}-interest`} className={label}>
            Primary interest
          </label>
          <select
            id={`${idPrefix}-interest`}
            className="lp-modal-field"
            value={values.interest}
            onChange={set("interest")}
          >
            <option value="">Select…</option>
            {INTERESTS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label htmlFor={`${idPrefix}-message`} className={label}>
          How can we help?
        </label>
        <textarea
          id={`${idPrefix}-message`}
          className="lp-modal-field min-h-[96px] resize-y"
          rows={4}
          placeholder="Agents in production, compliance needs, timeline…"
          value={values.message}
          onChange={set("message")}
        />
      </div>

      {error ? <p className="text-[14px] text-[#a7a7a7]">{error}</p> : null}

      <button type="submit" className="lp-btn-primary w-full" disabled={loading}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        {loading ? "Sending…" : "Request a demo"}
      </button>

      {onLogin || onLoginHref ? (
        <p className="text-center text-[14px] text-[#a7a7a7]">
          Already have an account?{" "}
          {onLoginHref ? (
            <a
              href={onLoginHref}
              className="font-medium text-white underline-offset-4 hover:text-[#67b3ef] hover:underline"
            >
              Sign in
            </a>
          ) : (
            <button
              type="button"
              className="font-medium text-white underline-offset-4 hover:text-[#67b3ef] hover:underline"
              onClick={onLogin}
            >
              Sign in
            </button>
          )}
        </p>
      ) : null}

      <p className="text-center text-[12px] text-[#7c7c7c]">
        By submitting, you agree to be contacted about ARTSA. No spam — one business day response.
      </p>
    </form>
  );
}

export function LandingContactSalesPanel({
  open,
  onClose,
  onLogin,
}: {
  open: boolean;
  onClose: () => void;
  onLogin?: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          className="lp lp-modal-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: easeOut }}
        >
          <button
            type="button"
            className="absolute inset-0 bg-[#070707]/95"
            aria-label="Close contact sales"
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="contact-sales-title"
            className="lp-modal-panel"
            style={{ backgroundColor: "#131313" }}
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.3, ease: easeOut }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="absolute right-3 top-3 rounded-[8px] p-1.5 text-[#a7a7a7] hover:bg-[#141414] hover:text-white"
              onClick={onClose}
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="mb-6 flex items-center gap-3 pr-8">
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] border border-[#313131]"
                style={{ backgroundColor: "#141414" }}
              >
                <LogoIcon size={22} />
              </div>
              <div>
                <p className="font-mono text-[12px] uppercase tracking-[0.85px] text-[#a7a7a7]">
                  Enterprise
                </p>
                <h2
                  id="contact-sales-title"
                  className="mt-1 text-[24px] font-semibold leading-[1.33] tracking-[-0.5px] text-white"
                >
                  Contact sales
                </h2>
              </div>
            </div>
            <p className="mb-6 text-[16px] leading-[1.5] tracking-[-0.19px] text-[#a7a7a7]">
              Tell us about your agent fleet — we&apos;ll schedule a tailored containment demo.
            </p>
            <ContactSalesForm
              idPrefix="modal-contact"
              onLogin={
                onLogin
                  ? () => {
                      onClose();
                      onLogin();
                    }
                  : undefined
              }
            />
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}
