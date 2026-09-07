import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-semibold tracking-[0.04em] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "rounded bg-button text-button-foreground hover:bg-button-hover shadow-none",
        destructive:
          "rounded bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-none",
        outline:
          "rounded border border-border bg-transparent text-foreground hover:border-muted-foreground hover:bg-muted/30 shadow-none",
        secondary:
          "rounded border border-border bg-secondary text-secondary-foreground hover:bg-muted shadow-none",
        ghost: "rounded text-foreground hover:bg-muted/70 shadow-none",
        link: "text-foreground underline-offset-4 hover:underline tracking-normal font-medium",
      },
      size: {
        default: "h-10 px-5 text-xs sm:text-sm",
        sm: "h-8 rounded px-3 text-xs",
        lg: "h-11 rounded px-6 text-sm",
        icon: "h-9 w-9 rounded",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size }), className)} ref={ref} {...props} />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
