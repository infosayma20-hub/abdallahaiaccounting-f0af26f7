import { createRef } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

afterEach(cleanup);

describe("shared Button slot contract", () => {
  it("renders and activates a single navigation child without crashing", () => {
    const onClick = vi.fn((event: React.MouseEvent<HTMLButtonElement>) => event.preventDefault());
    const ref = createRef<HTMLButtonElement>();
    render(<Button asChild ref={ref} onClick={onClick}><a href="/hr">الموارد البشرية</a></Button>);
    const link = screen.getByRole("link", { name: "الموارد البشرية" });
    expect(ref.current).toBe(link);
    fireEvent.click(link);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("preserves the single child for icon navigation with an accessible label", () => {
    render(<Button asChild size="icon" title="الموظفون"><a href="/hr/people" aria-label="الموظفون"><svg /></a></Button>);
    expect(screen.getByRole("link", { name: "الموظفون" })).toHaveAttribute("href", "/hr/people");
  });

  it("keeps labelled native icon actions clickable inside tooltip triggers", () => {
    const onClick = vi.fn();
    render(<TooltipProvider><Tooltip><TooltipTrigger asChild><Button size="icon" aria-label="طباعة" onClick={onClick}><svg /></Button></TooltipTrigger><TooltipContent>طباعة</TooltipContent></Tooltip></TooltipProvider>);
    fireEvent.click(screen.getByRole("button", { name: /طباعة/ }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});