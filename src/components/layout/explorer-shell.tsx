"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  AppBar,
  Box,
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
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
import { HeaderWalletMenu } from "@/components/wallet/header-wallet-menu";
import { ChainSelector } from "@/components/layout/chain-selector";
import { TopNavSearch } from "@/components/search/top-nav-search";
import { getActiveChainConfigFromClientCookie } from "@/lib/chain-selection";
import { getChainByKey, getConfiguredChains, getDefaultChainKey, type ChainConfig } from "@/lib/env";

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
  const pathname = usePathname();
  const [activeChain, setActiveChain] = useState<ChainConfig>(() => {
    const fallback = getChainByKey(getDefaultChainKey());
    return fallback ?? getConfiguredChains()[0];
  });

  useEffect(() => {
    setActiveChain(getActiveChainConfigFromClientCookie());
  }, []);

  const visibleMenus = menus.filter((menu) => {
    if (menu.requiresBex && activeChain.features?.bex !== true) {
      return false;
    }
    if (menu.requiresFeePolicy && activeChain.features?.feepolicy !== true) {
      return false;
    }
    if (menu.requiresOracle && activeChain.features?.oracle !== true) {
      return false;
    }
    return true;
  });

  return (
    <Box sx={{ display: "flex", minHeight: "100vh" }}>
      <AppBar
        position="fixed"
        sx={{
          zIndex: (theme) => theme.zIndex.drawer + 1,
          ml: `${drawerWidth}px`,
          width: `calc(100% - ${drawerWidth}px)`,
        }}
      >
        <Toolbar sx={{ justifyContent: "space-between", gap: 2 }}>
          <Typography variant="h6" noWrap component="div">
            Guru Chain Explorer
          </Typography>
          <Box sx={{ flex: 1, minWidth: 220, maxWidth: 640 }}>
            <TopNavSearch />
          </Box>
          <HeaderWalletMenu />
        </Toolbar>
      </AppBar>
      <Drawer
        variant="permanent"
        sx={{
          width: drawerWidth,
          flexShrink: 0,
          "& .MuiDrawer-paper": {
            width: drawerWidth,
            boxSizing: "border-box",
          },
        }}
      >
        <Toolbar sx={{ px: 0 }}>
          <Box sx={{ width: "100%" }}>
            <ChainSelector />
          </Box>
        </Toolbar>
        <Box sx={{ overflow: "auto" }}>
          <List>
            {visibleMenus.map((menu) => (
              <ListItemButton
                key={menu.href}
                component={Link}
                href={menu.href}
                selected={pathname.startsWith(menu.href)}
              >
                <ListItemIcon>{menu.icon}</ListItemIcon>
                <ListItemText primary={menu.label} />
              </ListItemButton>
            ))}
          </List>
        </Box>
      </Drawer>
      <Box component="main" sx={{ flexGrow: 1, p: 3, ml: 0 }}>
        <Toolbar />
        {children}
      </Box>
    </Box>
  );
}
