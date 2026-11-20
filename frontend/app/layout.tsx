import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./style.css";
export const metadata: Metadata = {
  title: "AegisAVAX · Transaction Firewall",
  description:
    "Mô phỏng giao dịch và quản lý két agent trên Anvil fork của Avalanche Fuji.",
};
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
