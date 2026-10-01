import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata={title:"返利政策配置工作台",description:"政策配置、期末试算与历史记录",icons:{icon:"/favicon.svg"}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="zh-CN"><body>{children}</body></html>;}
