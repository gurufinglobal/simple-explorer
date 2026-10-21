"use client";

import Link from "@/components/layout/chain-link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import {
  Alert,
  AppBar,
  Box,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import AccountBalanceOutlinedIcon from "@mui/icons-material/AccountBalanceOutlined";
import ViewAgendaOutlinedIcon from "@mui/icons-material/ViewAgendaOutlined";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import TokenOutlinedIcon from "@mui/icons-material/TokenOutlined";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import HowToVoteOutlinedIcon from "@mui/icons-material/HowToVoteOutlined";
import CurrencyExchangeOutlinedIcon from "@mui/icons-material/CurrencyExchangeOutlined";
import LocalAtmOutlinedIcon from "@mui/icons-material/LocalAtmOutlined";
import QueryStatsOutlinedIcon from "@mui/icons-material/QueryStatsOutlined";
import TuneOutlinedIcon from "@mui/icons-material/TuneOutlined";
import MenuIcon from "@mui/icons-material/Menu";
import { WalletPortfolioHydrator } from "@/components/wallet/wallet-portfolio-hydrator";
import { HeaderWalletMenu } from "@/components/wallet/header-wallet-menu";
import { ChainSelector } from "@/components/layout/chain-selector";
import { TopNavSearch } from "@/components/search/top-nav-search";
import { getActiveChainConfigFromClientCookie, synchronizeRouteChain, withChain } from "@/lib/chain-selection";
import { type ChainConfig } from "@/lib/env";

const drawerWidth = 240;

type MenuItem = {
  href: string;
  label: string;
  icon: ReactNode;
  requiresBex?: boolean;
  requiresFeePolicy?: boolean;
  requiresOracle?: boolean;
};

const menus: MenuItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: <DashboardOutlinedIcon /> },
  { href: "/staking", label: "Staking", icon: <AccountBalanceOutlinedIcon /> },
  { href: "/blocks", label: "Blocks", icon: <ViewAgendaOutlinedIcon /> },
  { href: "/transactions", label: "Transactions", icon: <ReceiptLongOutlinedIcon /> },
  { href: "/governance", label: "Governance", icon: <HowToVoteOutlinedIcon /> },
  { href: "/bex", label: "BEX", icon: <CurrencyExchangeOutlinedIcon />, requiresBex: true },
  { href: "/feepolicy", label: "FeePolicy", icon: <LocalAtmOutlinedIcon />, requiresFeePolicy: true },
  { href: "/oracle", label: "Oracle", icon: <QueryStatsOutlinedIcon />, requiresOracle: true },
  { href: "/params", label: "Params", icon: <TuneOutlinedIcon /> },
  { href: "/tokens", label: "Tokens", icon: <TokenOutlinedIcon /> },
  { href: "/operations", label: "IBC Channels / CCMs", icon: <SettingsOutlinedIcon /> },
];

export function ExplorerShell({ children }: { children: ReactNode }) {
  return <Suspense fallback={<Alert severity="info">체인 설정 확인 중…</Alert>}><ExplorerShellContent>{children}</ExplorerShellContent></Suspense>;
}

function ExplorerShellContent({ children }: { children: ReactNode }) {
  const search = useSearchParams();
  const routeChain = search.get("chain");
  const pathname = usePathname();
  const [activeChain, setActiveChain] = useState<ChainConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const desktop = useMediaQuery(useTheme().breakpoints.up("md"));
  useEffect(() => {
    const sync = () => {
      try { setActiveChain(getActiveChainConfigFromClientCookie()); setConfigError(null); }
      catch (e) { setActiveChain(null); setConfigError(e instanceof Error ? e.message : "체인 설정 오류"); }
    };
    synchronizeRouteChain();
    sync();
    if (routeChain === null) {
      try { window.history.replaceState(null, "", withChain(window.location.pathname + window.location.search + window.location.hash)); } catch { /* Configuration error is shown below. */ }
    }
    const onPopState = () => { synchronizeRouteChain(); sync(); };
    window.addEventListener("explorer:chain-changed", sync);
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("explorer:chain-changed", sync);
      window.removeEventListener("popstate", onPopState);
    };
  }, [routeChain]);

  const ready = activeChain && (routeChain === null || routeChain === activeChain.key);

  const visibleMenus = menus.filter((menu) => {
    if (menu.requiresBex && activeChain?.features?.bex !== true) {
      return false;
    }
    if (menu.requiresFeePolicy && activeChain?.features?.feepolicy !== true) {
      return false;
    }
    if (menu.requiresOracle && activeChain?.features?.oracle !== true) {
      return false;
    }
    return true;
  });

  const navigation = <>
    <Toolbar sx={{ px: 0 }}>
      <Box sx={{ width: "100%" }}><ChainSelector /></Box>
    </Toolbar>
    <Box sx={{ overflow: "auto" }}>
      <List>
        {visibleMenus.map((menu) => (
          <ListItemButton key={menu.href} component={Link} href={activeChain ? withChain(menu.href, activeChain.key) : menu.href}
            selected={pathname.startsWith(menu.href)} onClick={() => setMenuOpen(false)}>
            <ListItemIcon>{menu.icon}</ListItemIcon>
            <ListItemText primary={menu.label} />
          </ListItemButton>
        ))}
      </List>
    </Box>
  </>;

  return (
    <Box sx={{ display: "flex", flexDirection: { xs: "column", md: "row" }, minHeight: "100vh" }}>
      <AppBar
        position="fixed"
        sx={{
          position: { xs: "static", md: "fixed" },
          zIndex: (theme) => ({ xs: theme.zIndex.appBar, md: theme.zIndex.drawer + 1 }),
          ml: { xs: 0, md: `${drawerWidth}px` },
          width: { xs: "100%", md: `calc(100% - ${drawerWidth}px)` },
        }}
      >
        <Toolbar sx={{ justifyContent: "space-between", gap: { xs: 1, md: 2 }, flexWrap: { xs: "wrap", md: "nowrap" }, py: { xs: 1, md: 0 } }}>
          <IconButton aria-label="탐색 메뉴 열기" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)} sx={{ display: { md: "none" } }}>
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" noWrap component="div" sx={{ display: { xs: "none", lg: "block" } }}>
            Guru Chain Explorer
          </Typography>
          <Box sx={{ flex: { xs: "1 1 100%", md: 1 }, minWidth: 0, maxWidth: { md: 640 }, order: { xs: 1, md: 0 } }}>
            {ready && <TopNavSearch />}
          </Box>
          <Box sx={{ minWidth: 0, flex: { xs: 1, md: "initial" }, overflowWrap: "anywhere" }}>
            {ready && <HeaderWalletMenu />}
          </Box>
        </Toolbar>
      </AppBar>
      <Drawer
        variant="permanent"
        sx={{
          display: { xs: "none", md: "block" },
          width: drawerWidth,
          flexShrink: 0,
          "& .MuiDrawer-paper": {
            width: drawerWidth,
            boxSizing: "border-box",
          },
        }}
      >
        {navigation}
      </Drawer>
      <Drawer open={menuOpen && !desktop} onClose={() => setMenuOpen(false)} sx={{ display: { md: "none" }, "& .MuiDrawer-paper": { width: drawerWidth } }}>
        {navigation}
      </Drawer>
      <Box component="main" sx={{ flexGrow: 1, minWidth: 0, p: { xs: 2, md: 3 }, ml: 0 }}>
        <Toolbar sx={{ display: { xs: "none", md: "flex" } }} />
        {configError ? <Alert severity="error">{configError} 탐색 메뉴에서 체인을 선택하세요.</Alert> : ready ? <Box key={activeChain.key}><WalletPortfolioHydrator />{children}</Box> : <Alert severity="info">체인 설정 확인 중…</Alert>}
      </Box>
    </Box>
  );
}
