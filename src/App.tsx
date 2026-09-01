import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Activity,
  AlertTriangle,
  BellRing,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleUserRound,
  Clock3,
  Download,
  FileText,
  Gauge,
  LayoutDashboard,
  LifeBuoy,
  LockKeyhole,
  Mail,
  MapPin,
  Menu,
  MessageSquareText,
  MoreHorizontal,
  Plus,
  Radio,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Smartphone,
  Users,
  UsersRound,
  X,
  Zap,
  PanelLeftClose,
  PanelLeftOpen,
  Inbox,
  Eye,
  EyeOff,
  LogOut,
} from "lucide-react";
import {
  api,
  SignalOpsApiError,
  type ApiCategory,
  type ApiChannelSetting,
  type ApiPermission,
  type ApiRole,
  type ApiTenantSettings,
} from "./api";
import {
  alertFromApi,
  alertLevelForApi,
  channelForApi,
  departmentFromApi,
  facilityFromApi,
  groupFromApi,
  recipientFromApi,
  templateFromApi,
  tenantFromApi,
} from "./adapters";
import type {
  AudienceGroup,
  Broadcast,
  Channel,
  Department,
  Facility,
  MessageTemplate,
  NavPage,
  Recipient,
  Tenant,
} from "./types";

const navItems: {
  id: NavPage;
  label: string;
  icon: typeof LayoutDashboard;
  group?: string;
}[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "broadcasts", label: "Alerts", icon: Radio },
  { id: "responses", label: "Employee responses", icon: CheckCircle2 },
  { id: "people", label: "People & groups", icon: UsersRound },
  { id: "facilities", label: "Facilities", icon: Building2 },
  { id: "templates", label: "Templates", icon: FileText, group: "MANAGE" },
  { id: "roles", label: "Roles & approvals", icon: ShieldCheck },
  { id: "settings", label: "Settings", icon: Settings },
];

const pageTitles: Record<
  NavPage,
  { eyebrow: string; title: string; subtitle: string }
> = {
  overview: {
    eyebrow: "COMMAND CENTRE",
    title: "Good morning, Ananya",
    subtitle:
      "Monitor active incidents, delivery health and acknowledgements across your organisation.",
  },
  broadcasts: {
    eyebrow: "ALERT LIFECYCLE",
    title: "Alerts",
    subtitle:
      "Create, approve, monitor and audit every emergency alert and announcement.",
  },
  responses: {
    eyebrow: "SAFETY ACCOUNTABILITY",
    title: "Employee responses",
    subtitle:
      "Monitor acknowledgements, non-response and assistance requests during active incidents.",
  },
  people: {
    eyebrow: "DIRECTORY",
    title: "People & groups",
    subtitle: "Manage recipients and the audiences used for alerts.",
  },
  facilities: {
    eyebrow: "LOCATION INTELLIGENCE",
    title: "Facilities",
    subtitle: "See building occupancy and target alerts by location.",
  },
  templates: {
    eyebrow: "PREPAREDNESS",
    title: "Message templates",
    subtitle: "Respond quickly with reviewed, reusable emergency messages.",
  },
  roles: {
    eyebrow: "GOVERNANCE",
    title: "Roles & approvals",
    subtitle: "Control who can create, approve and release alerts.",
  },
  settings: {
    eyebrow: "WORKSPACE",
    title: "Channels & settings",
    subtitle: "Configure delivery providers and organisation-wide defaults.",
  },
};

const channelIcon: Record<Channel, typeof Mail> = {
  sms: MessageSquareText,
  email: Mail,
  android: Smartphone,
};
const channelLabel: Record<Channel, string> = {
  sms: "SMS",
  email: "Email",
  android: "Android push",
};

function App() {
  const accountFlow = window.location.pathname.endsWith("/activate")
    ? "activate"
    : window.location.pathname.endsWith("/forgot-password") ||
        window.location.pathname.endsWith("/reset-password")
      ? "forgot"
      : null;
  const [authenticated, setAuthenticated] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [currentUser, setCurrentUser] = useState({
    name: "Organisation administrator",
    email: "",
  });
  const [page, setPage] = useState<NavPage>(() => {
    const requested = window.location.hash.replace("#", "") as NavPage;
    return navItems.some((item) => item.id === requested)
      ? requested
      : "overview";
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem("signalops.sidebar") === "collapsed",
  );
  const [tenant, setTenant] = useState<Tenant>({
    id: "",
    slug: "",
    name: "SignalOps",
    shortName: "SO",
    plan: "Organisation workspace",
    facilities: 0,
    people: 0,
  });
  const [tenantMenu, setTenantMenu] = useState(false);
  const [headerPanel, setHeaderPanel] = useState<
    "search" | "notifications" | null
  >(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerPreset, setComposerPreset] = useState<MessageTemplate | null>(
    null,
  );
  const [addPersonOpen, setAddPersonOpen] = useState(false);
  const [addDepartmentOpen, setAddDepartmentOpen] = useState(false);
  const [templateEditorOpen, setTemplateEditorOpen] = useState(false);
  const [facilityEditorOpen, setFacilityEditorOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [groups, setGroups] = useState<AudienceGroup[]>([]);
  const [messageTemplates, setMessageTemplates] = useState<MessageTemplate[]>(
    [],
  );
  const [facilityRecords, setFacilityRecords] = useState<Facility[]>([]);
  const [categories, setCategories] = useState<ApiCategory[]>([]);
  const [roles, setRoles] = useState<ApiRole[]>([]);
  const [channelSettings, setChannelSettings] = useState<ApiChannelSetting[]>(
    [],
  );
  const templateCategories = categories.map((category) => category.name);
  const setTemplateCategories = (names: string[]) =>
    setCategories(
      names.map(
        (name) =>
          categories.find((category) => category.name === name) ?? {
            id: "",
            tenant_id: tenant.id,
            name,
            is_active: true,
          },
      ),
    );

  const errorMessage = (error: unknown) =>
    error instanceof SignalOpsApiError
      ? error.message
      : "The request could not be completed";
  const loadWorkspace = useCallback(async () => {
    setLoadingData(true);
    try {
      const [
        workspace,
        users,
        departmentRows,
        facilityRows,
        groupRows,
        categoryRows,
        templateRows,
        alertRows,
        roleRows,
        settingsData,
      ] = await Promise.all([
        api.workspace(),
        api.users(),
        api.departments(),
        api.facilities(),
        api.groups(),
        api.categories(),
        api.templates(),
        api.alerts(),
        api.roles(),
        api.settings(),
      ]);
      const nextTenant = tenantFromApi(workspace);
      setTenant(nextTenant);
      setRecipients(users.map((user) => recipientFromApi(user, nextTenant.id)));
      setDepartments(departmentRows.map(departmentFromApi));
      setFacilityRecords(facilityRows.map(facilityFromApi));
      setGroups(groupRows.map(groupFromApi));
      setCategories(categoryRows);
      setMessageTemplates(
        templateRows
          .filter((template) => template.is_active)
          .map(templateFromApi),
      );
      setBroadcasts(
        alertRows.map((alert) => alertFromApi(alert, nextTenant.id)),
      );
      setRoles(roleRows);
      setChannelSettings(settingsData.channels);
      const administrator = users.find(
        (user) => user.account_type === "admin" && user.status === "active",
      );
      if (administrator)
        setCurrentUser({
          name: administrator.full_name,
          email: administrator.email,
        });
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => {
    if (accountFlow) {
      setBootstrapping(false);
      return;
    }
    let active = true;
    api
      .restore()
      .then(async (restored) => {
        if (!active) return;
        if (restored) {
          setAuthenticated(true);
          try {
            await loadWorkspace();
          } catch {
            setAuthenticated(false);
          }
        }
      })
      .finally(() => {
        if (active) setBootstrapping(false);
      });
    return () => {
      active = false;
    };
  }, [accountFlow, loadWorkspace]);
  useEffect(
    () =>
      localStorage.setItem(
        "signalops.sidebar",
        sidebarCollapsed ? "collapsed" : "expanded",
      ),
    [sidebarCollapsed],
  );
  useEffect(() => {
    const syncPageFromUrl = () => {
      const requested = window.location.hash.replace("#", "") as NavPage;
      if (navItems.some((item) => item.id === requested)) {
        setPage(requested);
        window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      }
    };
    window.addEventListener("hashchange", syncPageFromUrl);
    return () => window.removeEventListener("hashchange", syncPageFromUrl);
  }, []);
  useEffect(() => {
    const hasOverlay =
      composerOpen ||
      addPersonOpen ||
      addDepartmentOpen ||
      templateEditorOpen ||
      facilityEditorOpen;
    document.body.style.overflow = hasOverlay ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [
    composerOpen,
    addPersonOpen,
    addDepartmentOpen,
    templateEditorOpen,
    facilityEditorOpen,
  ]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const tenantId = tenant.id;
  const tenants = useMemo(() => (tenant.id ? [tenant] : []), [tenant]);
  const tenantBroadcasts = broadcasts.filter(
    (item) => item.tenantId === tenantId,
  );
  const tenantRecipients = recipients.filter(
    (item) => item.tenantId === tenantId && item.accountType === "employee",
  );
  const activeBroadcasts = tenantBroadcasts.filter(
    (item) => item.status === "active",
  );
  const attemptedAlerts = tenantBroadcasts.filter(
    (item) => item.status !== "pending",
  );
  const deliveryTotal = attemptedAlerts.reduce(
    (sum, item) => sum + item.recipients,
    0,
  );
  const deliveredTotal = attemptedAlerts.reduce(
    (sum, item) => sum + item.delivered,
    0,
  );
  const deliveryRate = deliveryTotal
    ? Math.round((deliveredTotal / deliveryTotal) * 1000) / 10
    : 100;
  const criticalAttention = activeBroadcasts.filter(
    (item) => item.severity === "critical",
  );
  const failedDeliveries = tenantBroadcasts.reduce(
    (total, item) => total + item.failed,
    0,
  );
  const notificationCount =
    criticalAttention.length + (failedDeliveries ? 1 : 0);
  const selectedBroadcast =
    broadcasts.find((item) => item.id === detailId) ?? null;
  const meta = pageTitles[page];
  const openComposer = (preset?: MessageTemplate) => {
    setComposerPreset(preset ?? null);
    setComposerOpen(true);
  };

  const navigate = (nextPage: NavPage) => {
    setPage(nextPage);
    if (window.location.hash !== `#${nextPage}`)
      window.location.hash = nextPage;
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    setMobileNav(false);
    setTenantMenu(false);
    setHeaderPanel(null);
  };

  const createBroadcast = async (
    draft: Omit<
      Broadcast,
      | "id"
      | "tenantId"
      | "createdAt"
      | "createdBy"
      | "delivered"
      | "acknowledged"
      | "failed"
    >,
  ) => {
    try {
      const created = await api.createAlert({
        templateId: composerPreset?.id || null,
        categoryName: composerPreset?.category,
        alertLevel: alertLevelForApi(draft.severity),
        title: draft.title,
        message: draft.message,
        requireAcknowledgement: draft.requiresAcknowledgement,
        channels: draft.channels.map(channelForApi),
        audiences: [
          {
            type: draft.audienceType || "organisation",
            referenceId: draft.audienceReferenceId || null,
            displayName: draft.audience,
          },
        ],
        release: draft.status === "pending" ? "approval" : "immediate",
      });
      await loadWorkspace();
      setComposerOpen(false);
      setDetailId(created.public_id);
      navigate("broadcasts");
      setToast(
        draft.status === "pending"
          ? "Alert submitted for approval"
          : "Alert sent successfully",
      );
    } catch (error) {
      setToast(errorMessage(error));
    }
  };

  const addRecipient = async (person: Recipient) => {
    try {
      await api.createUser({
        accountType: "employee",
        fullName: person.name,
        email: person.email,
        phone: person.phone || undefined,
        employeeCode: person.employeeCode,
        jobTitle: person.role,
        departmentId: person.departmentId,
        facilityId: person.facilityId,
        buildingId: person.buildingId,
        roleIds: person.roleIds || [],
      });
      await loadWorkspace();
      setAddPersonOpen(false);
      setToast(`Invitation sent to ${person.name}`);
    } catch (error) {
      setToast(errorMessage(error));
    }
  };

  const addDepartment = async (department: Department) => {
    try {
      await api.createDepartment({
        name: department.name,
        description: department.description,
      });
      await loadWorkspace();
      setAddDepartmentOpen(false);
      setToast(`${department.name} department added`);
    } catch (error) {
      setToast(errorMessage(error));
    }
  };

  const saveTemplate = async (template: MessageTemplate) => {
    try {
      let categoryId = categories.find(
        (item) => item.name === template.category,
      )?.id;
      if (!categoryId)
        categoryId = (
          await api.createCategory({ name: template.category, isActive: true })
        ).id;
      await api.createTemplate({
        categoryId,
        name: template.title,
        alertLevel: alertLevelForApi(template.severity),
        titleTemplate: template.title,
        messageTemplate: template.message,
        requireAcknowledgement: template.requiresAcknowledgement,
        isActive: true,
        channels: template.channels.map(channelForApi),
      });
      await loadWorkspace();
      setTemplateEditorOpen(false);
      setToast(`${template.title} template created`);
    } catch (error) {
      setToast(errorMessage(error));
    }
  };

  const syncRecipients = async (next: Recipient[]) => {
    try {
      const removed = recipients.find(
        (person) => !next.some((candidate) => candidate.id === person.id),
      );
      if (removed) await api.updateUser(removed.id, { status: "disabled" });
      const changed = next.find((person) => {
        const current = recipients.find(
          (candidate) => candidate.id === person.id,
        );
        return current && JSON.stringify(current) !== JSON.stringify(person);
      });
      if (changed) {
        const selectedFacility = facilityRecords.find(
          (facility) => facility.name === changed.facility,
        );
        await api.updateUser(changed.id, {
          fullName: changed.name,
          email: changed.email,
          phone: changed.phone,
          jobTitle: changed.role,
          employeeCode: changed.employeeCode,
          departmentId: departments.find(
            (department) => department.name === changed.department,
          )?.id,
          facilityId: selectedFacility?.id,
          buildingId: selectedFacility?.buildings.find(
            (building) => building.name === changed.building,
          )?.id,
          roleIds: changed.roleIds || [],
          status: changed.status,
        });
      }
      await loadWorkspace();
      setToast(removed ? `${removed.name} disabled` : "Employee updated");
    } catch (error) {
      setToast(errorMessage(error));
    }
  };

  const syncDepartments = async (next: Department[]) => {
    try {
      const created = next.find(
        (item) => !departments.some((current) => current.id === item.id),
      );
      const removed = departments.find(
        (item) => !next.some((current) => current.id === item.id),
      );
      const changed = next.find((item) => {
        const current = departments.find(
          (candidate) => candidate.id === item.id,
        );
        return (
          current &&
          (current.name !== item.name ||
            current.description !== item.description)
        );
      });
      if (created)
        await api.createDepartment({
          name: created.name,
          description: created.description,
        });
      else if (removed) await api.deleteDepartment(removed.id);
      else if (changed)
        await api.updateDepartment(changed.id, {
          name: changed.name,
          description: changed.description,
        });
      await loadWorkspace();
      setToast("Departments updated");
    } catch (error) {
      setToast(errorMessage(error));
    }
  };

  const syncGroups = async (next: AudienceGroup[]) => {
    try {
      const created = next.find(
        (item) => !groups.some((current) => current.id === item.id),
      );
      const removed = groups.find(
        (item) => !next.some((current) => current.id === item.id),
      );
      const changed = next.find((item) => {
        const current = groups.find((candidate) => candidate.id === item.id);
        return current && JSON.stringify(current) !== JSON.stringify(item);
      });
      if (created)
        await api.createGroup({
          name: created.name,
          description: created.description,
          memberIds: created.memberIds,
        });
      else if (removed) await api.deleteGroup(removed.id);
      else if (changed)
        await api.updateGroup(changed.id, {
          name: changed.name,
          description: changed.description,
          memberIds: changed.memberIds,
        });
      await loadWorkspace();
      setToast("Audience groups updated");
    } catch (error) {
      setToast(errorMessage(error));
    }
  };

  const facilityPayload = (facility: Facility) => {
    const [city, ...stateParts] = facility.city.split(",");
    return {
      name: facility.name,
      addressLine: facility.address,
      city: city.trim(),
      state: stateParts.join(",").trim(),
      countryCode: "IN",
      status: "connected",
      buildings: facility.buildings.map((building) => ({
        name: building.name,
        mapX: building.x,
        mapY: building.y,
        mapWidth: building.w,
        mapHeight: building.h,
      })),
    };
  };

  const syncFacilities = async (next: Facility[]) => {
    try {
      const created = next.find(
        (item) => !facilityRecords.some((current) => current.id === item.id),
      );
      const removed = facilityRecords.find(
        (item) => !next.some((current) => current.id === item.id),
      );
      const changed = next.find((item) => {
        const current = facilityRecords.find(
          (candidate) => candidate.id === item.id,
        );
        return current && JSON.stringify(current) !== JSON.stringify(item);
      });
      if (created) await api.createFacility(facilityPayload(created));
      else if (removed) await api.deleteFacility(removed.id);
      else if (changed) {
        const before = facilityRecords.find((item) => item.id === changed.id)!;
        const payload = facilityPayload(changed);
        await api.updateFacility(changed.id, {
          name: payload.name,
          addressLine: payload.addressLine,
          city: payload.city,
          state: payload.state,
          status: payload.status,
        });
        for (const building of changed.buildings) {
          const buildingPayload = {
            name: building.name,
            mapX: building.x,
            mapY: building.y,
            mapWidth: building.w,
            mapHeight: building.h,
          };
          if (before.buildings.some((item) => item.id === building.id))
            await api.updateBuilding(building.id, buildingPayload);
          else await api.createBuilding(changed.id, buildingPayload);
        }
        for (const building of before.buildings.filter(
          (item) =>
            !changed.buildings.some((candidate) => candidate.id === item.id),
        ))
          await api.deleteBuilding(building.id);
      }
      await loadWorkspace();
      setToast("Facilities updated");
    } catch (error) {
      setToast(errorMessage(error));
    }
  };

  const syncTemplates = async (next: MessageTemplate[]) => {
    try {
      const removed = messageTemplates.find(
        (item) => !next.some((candidate) => candidate.id === item.id),
      );
      const changed = next.find((item) => {
        const current = messageTemplates.find(
          (candidate) => candidate.id === item.id,
        );
        return current && JSON.stringify(current) !== JSON.stringify(item);
      });
      if (removed) await api.deleteTemplate(removed.id);
      else if (changed) {
        let categoryId = categories.find(
          (item) => item.name === changed.category,
        )?.id;
        if (!categoryId)
          categoryId = (
            await api.createCategory({ name: changed.category, isActive: true })
          ).id;
        await api.updateTemplate(changed.id, {
          categoryId,
          name: changed.title,
          alertLevel: alertLevelForApi(changed.severity),
          titleTemplate: changed.title,
          messageTemplate: changed.message,
          requireAcknowledgement: changed.requiresAcknowledgement,
          isActive: true,
          channels: changed.channels.map(channelForApi),
        });
      }
      await loadWorkspace();
      setToast(removed ? "Template archived" : "Template updated");
    } catch (error) {
      setToast(errorMessage(error));
    }
  };

  const login = async (email: string, password: string, remember: boolean) => {
    const context = await api.login(email, password, remember);
    setCurrentUser({ name: context.user.fullName, email: context.user.email });
    await loadWorkspace();
    setAuthenticated(true);
  };

  if (accountFlow === "forgot") return <PasswordRecoveryPage />;
  if (accountFlow === "activate") return <AccountPasswordPage />;
  if (bootstrapping)
    return (
      <main className="login-page">
        <div className="loading-state">Loading SignalOps…</div>
      </main>
    );
  if (!authenticated) return <AdminLogin onLogin={login} />;

  return (
    <div className={`app-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-mark">
            <Radio size={22} />
          </div>
          <div>
            <strong>SignalOps</strong>
            <span>Emergency communication</span>
          </div>
        </div>
        <button
          className="sidebar-toggle"
          title={sidebarCollapsed ? "Expand navigation" : "Collapse navigation"}
          aria-label={
            sidebarCollapsed ? "Expand navigation" : "Collapse navigation"
          }
          onClick={() => setSidebarCollapsed((value) => !value)}
        >
          {sidebarCollapsed ? (
            <PanelLeftOpen size={17} />
          ) : (
            <PanelLeftClose size={17} />
          )}
        </button>
        <nav className="nav-list">
          {navItems.map((item, index) => {
            const Icon = item.icon;
            return (
              <div key={item.id}>
                {item.group && <div className="nav-group">{item.group}</div>}
                <button
                  title={sidebarCollapsed ? item.label : undefined}
                  aria-label={item.label}
                  aria-current={page === item.id ? "page" : undefined}
                  className={`nav-item ${page === item.id ? "active" : ""}`}
                  onClick={() => navigate(item.id)}
                >
                  <Icon size={19} />
                  <span>{item.label}</span>
                  {item.id === "broadcasts" && activeBroadcasts.length > 0 && (
                    <b>{activeBroadcasts.length}</b>
                  )}
                </button>
                {index === 4 && <div className="nav-separator" />}
              </div>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <button
            title={sidebarCollapsed ? "Help & support" : undefined}
            className="nav-item"
            onClick={() => {
              window.location.href =
                "mailto:support@signalops.in?subject=SignalOps support";
            }}
          >
            <LifeBuoy size={19} />
            <span>Help & support</span>
          </button>
          <button
            title={sidebarCollapsed ? "Log out" : undefined}
            className="nav-item logout-nav"
            onClick={async () => {
              await api.logout();
              setAuthenticated(false);
            }}
          >
            <LogOut size={19} />
            <span>Log out</span>
          </button>
          <div className="user-card">
            <div className="avatar">
              {currentUser.name
                .split(/\s+/)
                .map((part) => part[0])
                .join("")
                .slice(0, 2)
                .toUpperCase()}
            </div>
            <div>
              <strong>{currentUser.name}</strong>
              <span>Organisation admin</span>
            </div>
          </div>
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <button
            className="mobile-menu"
            onClick={() => setMobileNav((value) => !value)}
          >
            <Menu size={22} />
          </button>
          <div className="tenant-wrap">
            <button
              className="tenant-switcher"
              onClick={() => {
                setTenantMenu((value) => !value);
                setHeaderPanel(null);
              }}
            >
              <span className="tenant-logo">{tenant.shortName}</span>
              <span>
                <b>{tenant.name}</b>
                <small>{tenant.plan}</small>
              </span>
              <ChevronDown size={17} />
            </button>
            {tenantMenu && (
              <div className="tenant-dropdown">
                <p>SWITCH WORKSPACE</p>
                {tenants.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      setTenantMenu(false);
                      setDetailId(null);
                    }}
                  >
                    <span className="tenant-logo small">{item.shortName}</span>
                    <span>
                      <b>{item.name}</b>
                      <small>
                        {item.people} people · {item.facilities}{" "}
                        {item.facilities === 1 ? "facility" : "facilities"}
                      </small>
                    </span>
                    {item.id === tenantId && <Check size={17} />}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="top-actions">
            <button
              title="Search"
              aria-label="Search"
              className={`icon-button ${headerPanel === "search" ? "active" : ""}`}
              onClick={() => {
                setHeaderPanel((value) =>
                  value === "search" ? null : "search",
                );
                setTenantMenu(false);
              }}
            >
              <Search size={19} />
            </button>
            <button
              title="Notifications"
              aria-label="Notifications"
              className={`icon-button notification-button ${headerPanel === "notifications" ? "active" : ""}`}
              onClick={() => {
                setHeaderPanel((value) =>
                  value === "notifications" ? null : "notifications",
                );
                setTenantMenu(false);
              }}
            >
              <BellRing size={19} />
              {notificationCount > 0 && <i />}
            </button>
            <button className="primary-button" onClick={() => openComposer()}>
              <Plus size={18} />
              Create alert
            </button>
            {headerPanel === "search" && (
              <div className="header-popover search-popover">
                <span className="popover-label">SEARCH WORKSPACE</span>
                <div className="popover-search">
                  <Search size={17} />
                  <input
                    autoFocus
                    placeholder="Search alerts, people or facilities"
                  />
                </div>
                <div className="popover-section">
                  <span>QUICK LINKS</span>
                  <button
                    onClick={() => {
                      navigate("broadcasts");
                      setHeaderPanel(null);
                    }}
                  >
                    <Radio size={17} />
                    <span>
                      <b>Alerts</b>
                      <small>Active, pending and resolved alerts</small>
                    </span>
                    <ChevronRight size={16} />
                  </button>
                  <button
                    onClick={() => {
                      navigate("people");
                      setHeaderPanel(null);
                    }}
                  >
                    <Users size={17} />
                    <span>
                      <b>People & groups</b>
                      <small>Recipient directory and audiences</small>
                    </span>
                    <ChevronRight size={16} />
                  </button>
                  <button
                    onClick={() => {
                      navigate("facilities");
                      setHeaderPanel(null);
                    }}
                  >
                    <Building2 size={17} />
                    <span>
                      <b>Facilities</b>
                      <small>Buildings and location targeting</small>
                    </span>
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
            {headerPanel === "notifications" && (
              <div className="header-popover notification-popover">
                <div className="popover-head">
                  <div>
                    <span className="popover-label">NOTIFICATIONS</span>
                    <h3>Attention needed</h3>
                  </div>
                  <span className="count-chip">{notificationCount}</span>
                </div>
                {criticalAttention.slice(0, 2).map((alert) => (
                  <button
                    className="notification-item"
                    key={alert.id}
                    onClick={() => {
                      setDetailId(alert.id);
                      navigate("broadcasts");
                      setHeaderPanel(null);
                    }}
                  >
                    <span className="severity-icon critical">
                      <AlertTriangle size={17} />
                    </span>
                    <span>
                      <b>{alert.title}</b>
                      <small>
                        {Math.max(0, alert.recipients - alert.acknowledged)}{" "}
                        people awaiting acknowledgement
                      </small>
                    </span>
                    <ChevronRight size={16} />
                  </button>
                ))}
                {failedDeliveries > 0 && (
                  <button
                    className="notification-item"
                    onClick={() => {
                      navigate("broadcasts");
                      setHeaderPanel(null);
                    }}
                  >
                    <span className="severity-icon warning">
                      <MessageSquareText size={17} />
                    </span>
                    <span>
                      <b>{failedDeliveries} deliveries failed</b>
                      <small>Review alert delivery activity</small>
                    </span>
                    <ChevronRight size={16} />
                  </button>
                )}
                {!notificationCount && (
                  <div className="info-note">
                    <CheckCircle2 size={17} />
                    <span>No operational issues need attention.</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </header>

        <main className="content" aria-busy={loadingData}>
          <div className="page-heading">
            <div>
              <span className="eyebrow">{meta.eyebrow}</span>
              <h1>
                {page === "overview"
                  ? `Good morning, ${currentUser.name.split(" ")[0]}`
                  : meta.title}
              </h1>
              <p>{meta.subtitle}</p>
            </div>
            {page === "people" && (
              <div className="page-actions">
                <button
                  className="secondary-button"
                  onClick={() => setAddDepartmentOpen(true)}
                >
                  <Plus size={17} />
                  Add department
                </button>
                <button
                  className="secondary-button"
                  onClick={() => setAddPersonOpen(true)}
                >
                  <Plus size={17} />
                  Add person
                </button>
              </div>
            )}
            {page !== "overview" &&
              page !== "settings" &&
              page !== "people" &&
              page !== "roles" &&
              page !== "responses" && (
                <PageAction
                  page={page}
                  onAction={() => {
                    if (page === "broadcasts") openComposer();
                    else if (page === "templates") setTemplateEditorOpen(true);
                    else if (page === "facilities") setFacilityEditorOpen(true);
                    else
                      setToast(
                        "Role assignments can be managed from the role menu below.",
                      );
                  }}
                />
              )}
          </div>

          {page === "overview" && (
            <Overview
              broadcasts={tenantBroadcasts}
              active={activeBroadcasts}
              recipients={tenant.people}
              facilitiesCount={tenant.facilities}
              deliveryRate={deliveryRate}
              templates={messageTemplates.filter(
                (item) => item.tenantId === tenantId,
              )}
              facilities={facilityRecords.filter(
                (item) => item.tenantId === tenantId,
              )}
              channelSettings={channelSettings}
              onCreate={openComposer}
              onViewAll={() => {
                setDetailId(null);
                navigate("broadcasts");
              }}
              onOpenAlert={(id) => {
                setDetailId(id);
                navigate("broadcasts");
              }}
            />
          )}
          {page === "broadcasts" && (
            <BroadcastsPage
              broadcasts={tenantBroadcasts}
              selected={
                selectedBroadcast?.tenantId === tenantId
                  ? selectedBroadcast
                  : null
              }
              onSelect={setDetailId}
              onClose={() => setDetailId(null)}
              onNotify={setToast}
              onApprove={async (id) => {
                const alert = broadcasts.find((item) => item.id === id);
                if (!alert?.backendId) return;
                try {
                  await api.approveAlert(alert.backendId);
                  await loadWorkspace();
                  setToast("Alert approved and released to recipients");
                } catch (error) {
                  setToast(errorMessage(error));
                }
              }}
              onResolve={async (id) => {
                const alert = broadcasts.find((item) => item.id === id);
                if (!alert?.backendId) return;
                try {
                  await api.resolveAlert(alert.backendId);
                  await loadWorkspace();
                  setToast("Incident marked as resolved");
                } catch (error) {
                  setToast(errorMessage(error));
                }
              }}
            />
          )}
          {page === "responses" && (
            <ResponsesPage
              broadcasts={tenantBroadcasts}
              recipients={tenantRecipients}
              onNotify={setToast}
            />
          )}
          {page === "people" && (
            <PeoplePage
              recipients={tenantRecipients}
              departments={departments.filter(
                (item) => item.tenantId === tenantId,
              )}
              groups={groups.filter((item) => item.tenantId === tenantId)}
              facilities={facilityRecords.filter(
                (item) => item.tenantId === tenantId,
              )}
              roles={roles.filter((role) => role.audience === "employee")}
              onRecipientsChange={syncRecipients}
              onDepartmentsChange={syncDepartments}
              onGroupsChange={syncGroups}
              onResendInvitation={async (id) => {
                try {
                  await api.resendInvitation(id);
                  setToast("Invitation email sent");
                } catch (error) {
                  setToast(errorMessage(error));
                }
              }}
              onNotify={setToast}
            />
          )}
          {page === "facilities" && (
            <FacilitiesPage
              tenantId={tenantId}
              facilities={facilityRecords}
              onChange={syncFacilities}
            />
          )}
          {page === "templates" && (
            <TemplatesPage
              templates={messageTemplates.filter(
                (item) => item.tenantId === tenantId,
              )}
              categories={templateCategories}
              onCategoriesChange={setTemplateCategories}
              onUse={openComposer}
              onChange={syncTemplates}
            />
          )}
          {page === "roles" && (
            <RolesPage
              roles={roles}
              portalUsers={recipients.filter(
                (person) => person.accountType === "admin",
              )}
              onReload={loadWorkspace}
              onNotify={setToast}
            />
          )}
          {page === "settings" && <SettingsPage onNotify={setToast} />}
        </main>
      </div>

      {composerOpen && (
        <AlertComposer
          tenantId={tenantId}
          facilities={facilityRecords}
          recipients={tenantRecipients}
          groups={groups.filter((item) => item.tenantId === tenantId)}
          templates={messageTemplates.filter(
            (item) => item.tenantId === tenantId,
          )}
          preset={composerPreset}
          onClose={() => setComposerOpen(false)}
          onCreate={createBroadcast}
        />
      )}
      {addPersonOpen && (
        <AddPersonModal
          tenantId={tenantId}
          facilities={facilityRecords}
          departments={departments.filter((item) => item.tenantId === tenantId)}
          roles={roles.filter((role) => role.audience === "employee")}
          onClose={() => setAddPersonOpen(false)}
          onAdd={addRecipient}
        />
      )}
      {addDepartmentOpen && (
        <AddDepartmentModal
          tenantId={tenantId}
          onClose={() => setAddDepartmentOpen(false)}
          onAdd={addDepartment}
        />
      )}
      {templateEditorOpen && (
        <TemplateEditorModal
          tenantId={tenantId}
          categories={templateCategories}
          onCategoriesChange={setTemplateCategories}
          onClose={() => setTemplateEditorOpen(false)}
          onSave={saveTemplate}
        />
      )}
      {facilityEditorOpen && (
        <FacilityEditorModal
          tenantId={tenantId}
          onClose={() => setFacilityEditorOpen(false)}
          onSave={async (facility) => {
            await syncFacilities([...facilityRecords, facility]);
            setFacilityEditorOpen(false);
          }}
        />
      )}
      {(tenantMenu || headerPanel) && (
        <button
          className="popover-dismiss"
          aria-label="Close open menu"
          onClick={() => {
            setTenantMenu(false);
            setHeaderPanel(null);
          }}
        />
      )}
      {toast && (
        <div className="toast">
          <CheckCircle2 size={20} />
          <span>{toast}</span>
          <button onClick={() => setToast("")}>
            <X size={17} />
          </button>
        </div>
      )}
      {mobileNav && (
        <button
          className="mobile-overlay"
          aria-label="Close navigation"
          onClick={() => setMobileNav(false)}
        />
      )}
    </div>
  );
}

function AdminLogin({
  onLogin,
}: {
  onLogin: (
    email: string,
    password: string,
    remember: boolean,
  ) => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!email.trim() || password.length < 8) {
      setError("Enter a valid administrator email and password.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await onLogin(email, password, remember);
    } catch (problem) {
      setError(
        problem instanceof SignalOpsApiError
          ? problem.message
          : "An unexpected error occurred while loading the workspace. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };
  return (
    <main className="login-page">
      <section className="login-card">
        <div className="login-form-section">
          <h1>Welcome back</h1>
          <p>Sign in to your administrator workspace</p>
          <form onSubmit={submit}>
            <label htmlFor="admin-email">Email</label>
            <input
              id="admin-email"
              className="login-input"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
            />
            <label htmlFor="admin-password">Password</label>
            <div className="login-password">
              <input
                id="admin-password"
                className="login-input"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
              />
              <button
                type="button"
                aria-label={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword((value) => !value)}
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
            <div className="login-options">
              <label>
                <span
                  className={`login-checkbox ${remember ? "checked" : ""}`}
                  onClick={() => setRemember((value) => !value)}
                >
                  {remember && <Check size={13} />}
                </span>
                Remember me
              </label>
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  const query = email.trim()
                    ? `?email=${encodeURIComponent(email.trim())}`
                    : "";
                  window.location.href = `/forgot-password${query}`;
                }}
              >
                Forgot password?
              </button>
            </div>
            {error && <div className="login-error">{error}</div>}
            <button className="login-submit" disabled={loading}>
              {loading ? "Signing in…" : "Sign in to admin portal"}
            </button>
          </form>
        </div>
        <aside
          className="login-visual"
          aria-label="SignalOps administrator access"
        >
          <div className="blob blob-1" />
          <div className="blob blob-2" />
          <div className="blob blob-3" />
          <div className="blob blob-4" />
          <div className="blob blob-5" />
          <img
            className="astronaut-image"
            src="/images/astro.png"
            alt="Astronaut floating in space"
          />
        </aside>
      </section>
    </main>
  );
}

function PageAction({
  page,
  onAction,
}: {
  page: NavPage;
  onAction: () => void;
}) {
  const labels: Partial<Record<NavPage, string>> = {
    facilities: "Add facility",
    roles: "Invite administrator",
    templates: "Create template",
    people: "Add person",
    broadcasts: "Create alert",
  };
  return (
    <button className="secondary-button" onClick={onAction}>
      <Plus size={17} />
      {labels[page] ?? "Add"}
    </button>
  );
}

function Overview({
  broadcasts,
  active,
  recipients,
  facilitiesCount,
  deliveryRate,
  templates,
  facilities,
  channelSettings,
  onCreate,
  onViewAll,
  onOpenAlert,
}: {
  broadcasts: Broadcast[];
  active: Broadcast[];
  recipients: number;
  facilitiesCount: number;
  deliveryRate: number;
  templates: MessageTemplate[];
  facilities: Facility[];
  channelSettings: ApiChannelSetting[];
  onCreate: (preset?: MessageTemplate) => void;
  onViewAll: () => void;
  onOpenAlert: (id: string) => void;
}) {
  const critical = active.find((item) => item.severity === "critical");
  const findTemplate = (title: string) =>
    templates.find((item) => item.title === title) ?? templates[0];
  return (
    <>
      {critical && (
        <section className="incident-banner">
          <div className="pulse-icon">
            <AlertTriangle size={23} />
          </div>
          <div className="incident-copy">
            <span>ACTIVE CRITICAL INCIDENT</span>
            <h2>{critical.title}</h2>
            <p>
              {critical.facility} · Started{" "}
              {critical.createdAt.replace("Today, ", "")}
            </p>
          </div>
          <div className="ack-summary">
            <span>
              <b>{critical.acknowledged}</b> / {critical.recipients}
            </span>
            <small>People safe</small>
            <div className="progress">
              <i
                style={{
                  width: `${critical.recipients ? (critical.acknowledged / critical.recipients) * 100 : 0}%`,
                }}
              />
            </div>
          </div>
          <button
            className="light-button"
            onClick={() => onOpenAlert(critical.id)}
          >
            Open incident <ChevronRight size={17} />
          </button>
        </section>
      )}

      <section className="stat-grid">
        <StatCard
          icon={Radio}
          label="Active alerts"
          value={active.length}
          helper={
            active.some((item) => item.severity === "critical")
              ? `${active.filter((item) => item.severity === "critical").length} need attention`
              : "All under control"
          }
          tone="red"
        />
        <StatCard
          icon={Users}
          label="Employees"
          value={recipients.toLocaleString("en-IN")}
          helper="Registered in this workspace"
          tone="blue"
        />
        <StatCard
          icon={Building2}
          label="Active facilities"
          value={facilitiesCount}
          helper="Cloud connected"
          tone="purple"
        />
        <StatCard
          icon={Gauge}
          label="Delivery rate"
          value={`${deliveryRate}%`}
          helper="Last 30 days"
          tone="green"
        />
      </section>

      <section className="dashboard-grid">
        <div className="panel broadcast-panel">
          <PanelHeader
            title="Recent alerts"
            subtitle="Delivery and acknowledgement status across every channel"
            action={
              <button onClick={onViewAll}>
                View all alerts <ChevronRight size={15} />
              </button>
            }
          />
          <div className="broadcast-list">
            {broadcasts.slice(0, 4).map((item) => (
              <BroadcastRow
                key={item.id}
                item={item}
                onClick={() => onOpenAlert(item.id)}
              />
            ))}
            {!broadcasts.length && (
              <EmptyState
                title="No alerts yet"
                text="Create the first alert when the organisation is ready."
              />
            )}
          </div>
        </div>
        <div className="panel quick-panel">
          <PanelHeader
            title="Quick alert"
            subtitle="Start from a prepared emergency scenario"
          />
          <button
            className="emergency-action"
            onClick={() => onCreate(findTemplate("Fire evacuation"))}
          >
            <span>
              <AlertTriangle size={22} />
            </span>
            <div>
              <b>Send emergency alert</b>
              <small>Choose a prepared alert type</small>
            </div>
            <ChevronRight size={19} />
          </button>
          <div className="quick-list">
            <button onClick={() => onCreate(findTemplate("Fire evacuation"))}>
              <span className="quick-icon fire">01</span>
              <div>
                <b>Fire evacuation</b>
                <small>Evacuate to muster points</small>
              </div>
              <ChevronRight size={17} />
            </button>
            <button onClick={() => onCreate(findTemplate("Severe weather"))}>
              <span className="quick-icon weather">02</span>
              <div>
                <b>Severe weather</b>
                <small>Shelter or travel advisory</small>
              </div>
              <ChevronRight size={17} />
            </button>
            <button onClick={() => onCreate(findTemplate("Medical emergency"))}>
              <span className="quick-icon medical">03</span>
              <div>
                <b>Medical emergency</b>
                <small>Notify first responders</small>
              </div>
              <ChevronRight size={17} />
            </button>
          </div>
        </div>
      </section>

      <section className="dashboard-grid lower-grid">
        <FacilitySnapshot facilities={facilities} />
        <div className="panel health-panel">
          <PanelHeader
            title="Channel health"
            subtitle="Configured delivery providers"
          />
          {channelSettings.map((setting) => (
            <HealthRow
              key={setting.id}
              icon={
                setting.channel === "sms"
                  ? MessageSquareText
                  : setting.channel === "email"
                    ? Mail
                    : Smartphone
              }
              label={
                setting.channel === "push"
                  ? "Android push"
                  : setting.channel.toUpperCase()
              }
              detail={setting.provider}
              value={setting.is_enabled ? "Enabled" : "Disabled"}
            />
          ))}
        </div>
      </section>
    </>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  helper,
  tone,
}: {
  icon: typeof Radio;
  label: string;
  value: string | number;
  helper: string;
  tone: string;
}) {
  return (
    <div className="stat-card">
      <div className={`stat-icon ${tone}`}>
        <Icon size={21} />
      </div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{helper}</small>
      </div>
    </div>
  );
}

function PanelHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action?: ReactNode;
}) {
  return (
    <div className="panel-header">
      <div>
        <h3>{title}</h3>
        <p>{subtitle}</p>
      </div>
      {action}
    </div>
  );
}

function BroadcastRow({
  item,
  onClick,
}: {
  item: Broadcast;
  onClick: () => void;
}) {
  const percent = item.recipients
    ? Math.round((item.delivered / item.recipients) * 100)
    : 0;
  return (
    <button className="broadcast-row" onClick={onClick}>
      <span className={`severity-dot ${item.severity}`}>
        <span />
      </span>
      <div className="broadcast-main">
        <b>{item.title}</b>
        <small>
          {item.facility} · {item.createdAt}
        </small>
      </div>
      <ChannelPills channels={item.channels} compact />
      <div className="delivery-cell">
        <b>{percent}%</b>
        <small>
          {item.delivered}/{item.recipients} delivered
        </small>
      </div>
      <span className={`status-pill ${item.status}`}>{item.status}</span>
      <ChevronRight size={17} />
    </button>
  );
}

function FacilitySnapshot({ facilities }: { facilities: Facility[] }) {
  const facility = facilities[0];
  if (!facility)
    return (
      <div className="panel facility-snapshot">
        <EmptyState
          title="No facility configured"
          text="Add a facility to enable location-based targeting."
        />
      </div>
    );
  return (
    <div className="panel facility-snapshot">
      <PanelHeader
        title={facility.name}
        subtitle="Current building status"
        action={
          <span className="live-chip">
            <i /> LIVE
          </span>
        }
      />
      <div className="mini-map">
        <div className="map-road horizontal" />
        <div className="map-road vertical" />
        {facility.buildings.slice(0, 4).map((building, index) => (
          <div
            className={`mini-building b${index + 1} ${building.status === "alert" ? "danger" : building.status}`}
            key={building.id}
          >
            <span>{building.name}</span>
            <i>{building.people}</i>
          </div>
        ))}
        <div className="muster">M</div>
      </div>
      <div className="map-legend">
        <span>
          <i className="safe" />
          Clear
        </span>
        <span>
          <i className="warn" />
          Advisory
        </span>
        <span>
          <i className="danger" />
          Active alert
        </span>
        <b>{facility.people} people on site</b>
      </div>
    </div>
  );
}

function HealthRow({
  icon: Icon,
  label,
  detail,
  value,
}: {
  icon: typeof Mail;
  label: string;
  detail: string;
  value: string;
}) {
  return (
    <div className="health-row">
      <span>
        <Icon size={19} />
      </span>
      <div>
        <b>{label}</b>
        <small>{detail}</small>
      </div>
      <i />
      <em>{value}</em>
    </div>
  );
}

function BroadcastsPage({
  broadcasts,
  selected,
  onSelect,
  onClose,
  onApprove,
  onResolve,
  onNotify,
}: {
  broadcasts: Broadcast[];
  selected: Broadcast | null;
  onSelect: (id: string) => void;
  onClose: () => void;
  onApprove: (id: string) => void;
  onResolve: (id: string) => void;
  onNotify: (message: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [channelFilter, setChannelFilter] = useState("all");
  const [view, setView] = useState<"active" | "pending" | "history" | "all">(
    selected?.status === "pending"
      ? "pending"
      : selected?.status === "resolved"
        ? "history"
        : "active",
  );
  const visible = broadcasts.filter((item) => {
    const matchesSearch = `${item.title} ${item.facility} ${item.createdBy}`
      .toLowerCase()
      .includes(query.toLowerCase());
    const matchesView =
      view === "all" ||
      (view === "history" ? item.status === "resolved" : item.status === view);
    return (
      matchesSearch &&
      matchesView &&
      (severityFilter === "all" || item.severity === severityFilter) &&
      (channelFilter === "all" ||
        item.channels.includes(channelFilter as Channel))
    );
  });
  const exportAlerts = () => {
    const csv = [
      "ID,Title,Severity,Status,Audience,Location,Recipients,Delivered,Failed",
      ...visible.map((item) =>
        [
          item.id,
          item.title,
          item.severity,
          item.status,
          item.audience,
          item.facility,
          item.recipients,
          item.delivered,
          item.failed,
        ]
          .map((value) => `"${String(value).replaceAll('"', '""')}"`)
          .join(","),
      ),
    ].join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    link.download = "signalops-alerts.csv";
    link.click();
    URL.revokeObjectURL(link.href);
    onNotify("Alert export downloaded");
  };
  return (
    <>
      <div className="lifecycle-strip">
        <div>
          <Activity size={19} />
          <span>
            <b>
              {broadcasts.filter((item) => item.status === "active").length}
            </b>{" "}
            active alerts
          </span>
        </div>
        <ChevronRight size={16} />
        <div>
          <Inbox size={19} />
          <span>
            <b>
              {broadcasts.filter((item) => item.status === "pending").length}
            </b>{" "}
            awaiting approval
          </span>
        </div>
        <ChevronRight size={16} />
        <div>
          <CheckCircle2 size={19} />
          <span>
            <b>
              {broadcasts.filter((item) => item.status === "resolved").length}
            </b>{" "}
            resolved / archived
          </span>
        </div>
        <p>
          An alert is created manually, optionally approved, delivered through
          selected channels, acknowledged when required, then resolved and
          retained for audit.
        </p>
      </div>
      <div className="alert-tabs" role="tablist" aria-label="Alert status">
        {(
          [
            ["active", "Active"],
            ["pending", "Awaiting approval"],
            ["history", "History"],
            ["all", "All alerts"],
          ] as const
        ).map(([id, label]) => (
          <button
            role="tab"
            aria-selected={view === id}
            className={view === id ? "active" : ""}
            key={id}
            onClick={() => {
              setView(id);
              onClose();
            }}
          >
            {label}
            <span>
              {id === "all"
                ? broadcasts.length
                : id === "history"
                  ? broadcasts.filter((item) => item.status === "resolved")
                      .length
                  : broadcasts.filter((item) => item.status === id).length}
            </span>
          </button>
        ))}
      </div>
      <div className={`split-view ${selected ? "has-detail" : ""}`}>
        <div className="panel data-panel">
          <div className="toolbar">
            <div className="search-box">
              <Search size={17} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by alert, location or sender"
              />
            </div>
            <select
              aria-label="Filter by severity"
              value={severityFilter}
              onChange={(event) => setSeverityFilter(event.target.value)}
            >
              <option value="all">All levels</option>
              <option value="critical">Critical</option>
              <option value="warning">Advisory</option>
              <option value="info">Information</option>
            </select>
            <select
              aria-label="Filter by channel"
              value={channelFilter}
              onChange={(event) => setChannelFilter(event.target.value)}
            >
              <option value="all">All channels</option>
              <option value="sms">SMS</option>
              <option value="email">Email</option>
              <option value="android">Mobile app</option>
            </select>
            <button className="filter-button" onClick={exportAlerts}>
              <Download size={16} />
              Export
            </button>
          </div>
          <div className="broadcast-table-head">
            <span>Alert</span>
            <span>Audience</span>
            <span>Delivery</span>
            <span>Status</span>
            <span />
          </div>
          {visible.map((item) => (
            <button
              key={item.id}
              className={`broadcast-table-row ${selected?.id === item.id ? "selected" : ""}`}
              onClick={() => onSelect(item.id)}
            >
              <div>
                <span className={`severity-icon ${item.severity}`}>
                  <AlertTriangle size={17} />
                </span>
                <span>
                  <b>{item.title}</b>
                  <small>
                    {item.id} · {item.createdAt}
                  </small>
                </span>
              </div>
              <span>
                <b>{item.audience}</b>
                <small>{item.facility}</small>
              </span>
              <span>
                <b>
                  {item.delivered}/{item.recipients}
                </b>
                <small>
                  {item.failed ? `${item.failed} failed` : "All delivered"}
                </small>
              </span>
              <span className={`status-pill ${item.status}`}>
                {item.status}
              </span>
              <ChevronRight size={17} />
            </button>
          ))}
          {!visible.length && (
            <EmptyState
              title={`No ${view === "history" ? "historical" : view} alerts`}
              text={
                query
                  ? "Try another search term."
                  : "Alerts will appear here as they move through this stage."
              }
            />
          )}
        </div>
        {selected && (
          <aside className="detail-panel">
            <div className="detail-top">
              <span className={`severity-label ${selected.severity}`}>
                {selected.severity}
              </span>
              <button onClick={onClose}>
                <X size={19} />
              </button>
            </div>
            <h2>{selected.title}</h2>
            <p className="detail-id">
              {selected.id} · {selected.createdAt}
            </p>
            <div className="message-preview">
              <span>MESSAGE</span>
              <p>{selected.message}</p>
            </div>
            <dl className="detail-list">
              <div>
                <dt>Location</dt>
                <dd>
                  <MapPin size={16} />
                  {selected.facility}
                </dd>
              </div>
              <div>
                <dt>Audience</dt>
                <dd>
                  <Users size={16} />
                  {selected.audience}
                </dd>
              </div>
              <div>
                <dt>Sent by</dt>
                <dd>
                  <CircleUserRound size={16} />
                  {selected.createdBy}
                </dd>
              </div>
              <div>
                <dt>Channels</dt>
                <dd>
                  <ChannelPills channels={selected.channels} />
                </dd>
              </div>
            </dl>
            <h3>Delivery progress</h3>
            <div className="delivery-stats">
              <div>
                <b>{selected.recipients}</b>
                <span>Targeted</span>
              </div>
              <div>
                <b>{selected.delivered}</b>
                <span>Delivered</span>
              </div>
              <div>
                <b>{selected.failed}</b>
                <span>Failed</span>
              </div>
            </div>
            {selected.requiresAcknowledgement && (
              <div className="ack-card">
                <div>
                  <span>
                    <CheckCircle2 size={18} />
                    Acknowledgements
                  </span>
                  <b>
                    {Math.round(
                      (selected.acknowledged / selected.recipients) * 100,
                    )}
                    %
                  </b>
                </div>
                <div className="progress">
                  <i
                    style={{
                      width: `${(selected.acknowledged / selected.recipients) * 100}%`,
                    }}
                  />
                </div>
                <p>
                  <b>{selected.acknowledged} safe</b>
                  <span>
                    {selected.recipients - selected.acknowledged} awaiting
                    response
                  </span>
                </p>
              </div>
            )}
            {selected.requiresAcknowledgement && (
              <div className="info-note">
                <CheckCircle2 size={18} />
                <span>
                  Open Employee responses for the live acknowledgement roster,
                  reminders, and assistance escalation.
                </span>
              </div>
            )}
            {selected.status === "pending" && (
              <div className="approval-actions">
                <div>
                  <ShieldCheck size={18} />
                  <span>
                    <b>Approval required</b>
                    <small>Submitted by {selected.createdBy}</small>
                  </span>
                </div>
                <button
                  className="primary-button"
                  onClick={() => onApprove(selected.id)}
                >
                  <Send size={16} />
                  Approve & send
                </button>
                <button
                  className="text-button"
                  onClick={() =>
                    onNotify("Alert returned to its creator for changes.")
                  }
                >
                  Return for changes
                </button>
              </div>
            )}
            {selected.status === "active" && (
              <button
                className="resolve-button"
                onClick={() => onResolve(selected.id)}
              >
                <Check size={18} />
                Mark incident resolved
              </button>
            )}
          </aside>
        )}
      </div>
    </>
  );
}

function PeoplePage({
  recipients,
  departments,
  groups,
  facilities,
  roles,
  onRecipientsChange,
  onDepartmentsChange,
  onGroupsChange,
  onResendInvitation,
  onNotify,
}: {
  recipients: Recipient[];
  departments: Department[];
  groups: AudienceGroup[];
  facilities: Facility[];
  roles: ApiRole[];
  onRecipientsChange: (people: Recipient[]) => void;
  onDepartmentsChange: (departments: Department[]) => void;
  onGroupsChange: (groups: AudienceGroup[]) => void;
  onResendInvitation: (id: string) => void;
  onNotify: (message: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState("All departments");
  const [view, setView] = useState<"people" | "groups" | "departments">(
    "people",
  );
  const [newGroupName, setNewGroupName] = useState("");
  const [editingPerson, setEditingPerson] = useState<Recipient | null>(null);
  const [editingGroup, setEditingGroup] = useState<AudienceGroup | null>(null);
  const [editingDepartment, setEditingDepartment] = useState<Department | null>(
    null,
  );
  const visible = recipients.filter(
    (person) =>
      `${person.name} ${person.email} ${person.role}`
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (department === "All departments" || person.department === department),
  );
  const departmentOptions = [
    "All departments",
    ...departments.map((item) => item.name),
  ];
  const createGroup = () => {
    if (!newGroupName.trim()) return;
    onGroupsChange([
      ...groups,
      {
        id: crypto.randomUUID(),
        tenantId: recipients[0]?.tenantId ?? "",
        name: newGroupName.trim(),
        description: "Custom alert audience",
        memberIds: [],
      },
    ]);
    setNewGroupName("");
    onNotify("Audience group created");
  };
  const exportPeople = () => {
    const csv = [
      "Name,Email,Phone,Role,Department,Facility,Building,Status",
      ...visible.map((person) =>
        [
          person.name,
          person.email,
          person.phone,
          person.role,
          person.department,
          person.facility,
          person.building,
          person.status,
        ]
          .map((value) => `"${value.replaceAll('"', '""')}"`)
          .join(","),
      ),
    ].join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    link.download = "signalops-people.csv";
    link.click();
    URL.revokeObjectURL(link.href);
    onNotify("People export downloaded");
  };
  return (
    <>
      <div className="context-note">
        <UsersRound size={18} />
        <p>
          <b>Who receives alerts?</b> Administrators add people manually, assign
          each person to a facility and building, then use saved groups or
          locations as alert audiences.
        </p>
      </div>
      <div className="directory-stats">
        <div>
          <Users size={20} />
          <span>
            <b>{recipients.length}</b> people in directory
          </span>
        </div>
        <div>
          <CheckCircle2 size={20} />
          <span>
            <b>{departments.length}</b> departments
          </span>
        </div>
        <div>
          <UsersRound size={20} />
          <span>
            <b>{groups.length}</b> saved groups
          </span>
        </div>
      </div>
      <div className="alert-tabs">
        <button
          className={view === "people" ? "active" : ""}
          onClick={() => setView("people")}
        >
          People <span>{recipients.length}</span>
        </button>
        <button
          className={view === "groups" ? "active" : ""}
          onClick={() => setView("groups")}
        >
          Groups <span>{groups.length}</span>
        </button>
        <button
          className={view === "departments" ? "active" : ""}
          onClick={() => setView("departments")}
        >
          Departments <span>{departments.length}</span>
        </button>
      </div>
      {view === "people" ? (
        <div className="panel data-panel">
          <div className="toolbar">
            <div className="search-box">
              <Search size={17} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by name, role or email"
              />
            </div>
            <select
              aria-label="Filter by department"
              value={department}
              onChange={(event) => setDepartment(event.target.value)}
            >
              {departmentOptions.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
            <button className="filter-button" onClick={exportPeople}>
              <Download size={16} />
              Export
            </button>
          </div>
          <div className="people-table-head no-channels">
            <span>Person</span>
            <span>Role & department</span>
            <span>Location</span>
            <span>Mobile app</span>
            <span>Status</span>
            <span />
          </div>
          {visible.map((person) => (
            <div className="people-row" key={person.id}>
              <div>
                <span className="person-avatar">{person.initials}</span>
                <span>
                  <b>{person.name}</b>
                  <small>
                    {person.email}
                    <br />
                    {person.phone}
                  </small>
                </span>
              </div>
              <span>
                <b>{person.role}</b>
                <small>{person.department}</small>
              </span>
              <span>
                <b>{person.facility}</b>
                <small>{person.building}</small>
              </span>
              <button
                className={`device-state ${person.status === "active" ? "ready" : "pending"}`}
                disabled={person.status !== "invited"}
                onClick={() => onResendInvitation(person.id)}
              >
                <i>
                  <Smartphone size={15} />
                </i>
                <span>
                  <b>
                    {person.status === "active"
                      ? "App access active"
                      : person.status === "invited"
                        ? "Invite pending"
                        : "Access unavailable"}
                  </b>
                  <small>
                    {person.status === "invited"
                      ? "Resend invite"
                      : person.status === "active"
                        ? "Activation complete"
                        : person.status}
                  </small>
                </span>
              </button>
              <span className={`status-pill ${person.status}`}>
                {person.status}
              </span>
              <button
                title={`Manage ${person.name}`}
                onClick={() => setEditingPerson(person)}
              >
                <MoreHorizontal size={18} />
              </button>
            </div>
          ))}
        </div>
      ) : view === "groups" ? (
        <div className="panel data-panel">
          <div className="toolbar">
            <div className="search-box">
              <UsersRound size={17} />
              <input
                value={newGroupName}
                onChange={(event) => setNewGroupName(event.target.value)}
                placeholder="New group name"
              />
            </div>
            <button className="primary-button" onClick={createGroup}>
              <Plus size={16} />
              Create group
            </button>
          </div>
          <div className="group-grid">
            {groups.map((group) => {
              const members = recipients.filter((person) =>
                group.memberIds.includes(person.id),
              );
              return (
                <div className="group-card" key={group.id}>
                  <span className="stat-icon blue">
                    <UsersRound size={20} />
                  </span>
                  <div>
                    <b>{group.name}</b>
                    <small>{group.description}</small>
                    <em>
                      {members.length
                        ? members.map((person) => person.name).join(", ")
                        : "No members yet"}
                    </em>
                  </div>
                  <button onClick={() => setEditingGroup(group)}>Manage</button>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="panel data-panel">
          <div className="group-grid">
            {departments.map((item) => (
              <div className="group-card" key={item.id}>
                <span className="stat-icon purple">
                  <Building2 size={20} />
                </span>
                <div>
                  <b>{item.name}</b>
                  <small>{item.description}</small>
                  <em>
                    {
                      recipients.filter(
                        (person) => person.department === item.name,
                      ).length
                    }{" "}
                    people
                  </em>
                </div>
                <button onClick={() => setEditingDepartment(item)}>
                  Manage
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      {editingPerson && (
        <PersonEditorModal
          person={editingPerson}
          departments={departments}
          facilities={facilities}
          roles={roles}
          onClose={() => setEditingPerson(null)}
          onSave={(next) => {
            onRecipientsChange(
              recipients.map((item) => (item.id === next.id ? next : item)),
            );
            setEditingPerson(null);
          }}
          onDelete={() => {
            onRecipientsChange(
              recipients.filter((item) => item.id !== editingPerson.id),
            );
            onGroupsChange(
              groups.map((group) => ({
                ...group,
                memberIds: group.memberIds.filter(
                  (id) => id !== editingPerson.id,
                ),
              })),
            );
            setEditingPerson(null);
          }}
        />
      )}
      {editingGroup && (
        <GroupEditorModal
          group={editingGroup}
          people={recipients}
          onClose={() => setEditingGroup(null)}
          onSave={(next) => {
            onGroupsChange(
              groups.map((item) => (item.id === next.id ? next : item)),
            );
            setEditingGroup(null);
          }}
          onDelete={() => {
            onGroupsChange(
              groups.filter((item) => item.id !== editingGroup.id),
            );
            setEditingGroup(null);
          }}
        />
      )}
      {editingDepartment && (
        <DepartmentEditorModal
          department={editingDepartment}
          onClose={() => setEditingDepartment(null)}
          onSave={(next) => {
            onDepartmentsChange(
              departments.map((item) => (item.id === next.id ? next : item)),
            );
            if (next.name !== editingDepartment.name)
              onRecipientsChange(
                recipients.map((person) =>
                  person.department === editingDepartment.name
                    ? { ...person, department: next.name }
                    : person,
                ),
              );
            setEditingDepartment(null);
          }}
          onDelete={() => {
            if (
              recipients.some(
                (person) => person.department === editingDepartment.name,
              )
            ) {
              onNotify(
                "Move people out of this department before deleting it.",
              );
              return;
            }
            onDepartmentsChange(
              departments.filter((item) => item.id !== editingDepartment.id),
            );
            setEditingDepartment(null);
          }}
        />
      )}
    </>
  );
}

type EmployeeResponse = {
  personId: string;
  status: "safe" | "awaiting" | "assistance";
  respondedAt: string;
  note: string;
  reminded: boolean;
  escalated: boolean;
  assistanceId?: string;
};
function ResponsesPage({
  broadcasts,
  recipients,
  onNotify,
}: {
  broadcasts: Broadcast[];
  recipients: Recipient[];
  onNotify: (message: string) => void;
}) {
  const acknowledgementAlerts = broadcasts.filter(
    (item) => item.requiresAcknowledgement,
  );
  const [alertId, setAlertId] = useState(acknowledgementAlerts[0]?.id ?? "");
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [responses, setResponses] = useState<EmployeeResponse[]>([]);
  const selectedAlert =
    acknowledgementAlerts.find((item) => item.id === alertId) ??
    acknowledgementAlerts[0];
  useEffect(() => {
    if (!alertId && acknowledgementAlerts[0])
      setAlertId(acknowledgementAlerts[0].id);
  }, [acknowledgementAlerts, alertId]);
  useEffect(() => {
    if (!selectedAlert?.backendId) {
      setResponses([]);
      return;
    }
    api
      .alertResponses(selectedAlert.backendId)
      .then((rows) =>
        setResponses(
          rows.map((row) => ({
            personId: row.user_id,
            status:
              row.status === "needs_assistance"
                ? "assistance"
                : row.status === "safe" || row.status === "acknowledged"
                  ? "safe"
                  : "awaiting",
            respondedAt: row.acknowledged_at
              ? new Date(row.acknowledged_at).toLocaleTimeString("en-IN", {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "Not responded",
            note: row.note || "",
            reminded: false,
            escalated: row.assistance_status === "assigned",
            assistanceId: row.assistance_id || undefined,
          })),
        ),
      )
      .catch((error) =>
        onNotify(
          error instanceof SignalOpsApiError
            ? error.message
            : "Unable to load employee responses",
        ),
      );
  }, [onNotify, selectedAlert?.backendId]);
  const visible = responses
    .map((response) => ({
      response,
      person: recipients.find((item) => item.id === response.personId),
    }))
    .filter(
      (item) =>
        item.person &&
        (filter === "all" || item.response.status === filter) &&
        `${item.person?.name} ${item.person?.department} ${item.person?.facility}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    );
  const count = (status: EmployeeResponse["status"]) =>
    responses.filter((item) => item.status === status).length;
  const update = (personId: string, patch: Partial<EmployeeResponse>) =>
    setResponses((current) =>
      current.map((item) =>
        item.personId === personId ? { ...item, ...patch } : item,
      ),
    );
  const remind = async (userIds?: string[]) => {
    if (!selectedAlert?.backendId) return;
    try {
      await api.remindAlertRecipients(selectedAlert.backendId, userIds);
      setResponses((current) =>
        current.map((item) =>
          (!userIds || userIds.includes(item.personId)) &&
          item.status === "awaiting"
            ? { ...item, reminded: true }
            : item,
        ),
      );
      onNotify("Reminder queued for non-responsive employees");
    } catch (error) {
      onNotify(
        error instanceof SignalOpsApiError
          ? error.message
          : "Unable to queue reminders",
      );
    }
  };
  const escalate = async (response: EmployeeResponse, name: string) => {
    if (!response.assistanceId) return;
    try {
      await api.updateAssistance(response.assistanceId, { status: "assigned" });
      update(response.personId, { escalated: true });
      onNotify(`Emergency response escalated for ${name}`);
    } catch (error) {
      onNotify(
        error instanceof SignalOpsApiError
          ? error.message
          : "Unable to escalate assistance request",
      );
    }
  };
  if (!selectedAlert) {
    return (
      <div className="panel response-empty-panel">
        <EmptyState
          title="No acknowledgement alerts yet"
          text="Employee responses will appear here after an alert requiring acknowledgement is sent."
        />
      </div>
    );
  }
  return (
    <>
      <div className="response-incident-bar">
        <div>
          <span className="severity-icon critical">
            <AlertTriangle size={18} />
          </span>
          <div>
            <small>MONITORING INCIDENT</small>
            <select
              value={alertId}
              onChange={(event) => setAlertId(event.target.value)}
            >
              {acknowledgementAlerts.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.title} · {item.id}
                </option>
              ))}
            </select>
          </div>
        </div>
        <span className="status-chip">
          CURRENT STATUS
        </span>
      </div>
      <div className="response-stats">
        <div>
          <CheckCircle2 size={21} />
          <span>
            <b>{count("safe")}</b> confirmed safe
          </span>
        </div>
        <div>
          <Clock3 size={21} />
          <span>
            <b>{count("awaiting")}</b> awaiting response
          </span>
        </div>
        <div className="danger">
          <LifeBuoy size={21} />
          <span>
            <b>{count("assistance")}</b> need assistance
          </span>
        </div>
        <div>
          <Users size={21} />
          <span>
            <b>{responses.length}</b> targeted employees
          </span>
        </div>
      </div>
      <div className="panel data-panel">
        <div className="toolbar">
          <div className="search-box">
            <Search size={17} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search employee, department or location"
            />
          </div>
          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          >
            <option value="all">All responses</option>
            <option value="safe">Safe</option>
            <option value="awaiting">Awaiting response</option>
            <option value="assistance">Needs assistance</option>
          </select>
          <button className="filter-button" onClick={() => remind()}>
            <Send size={15} />
            Remind all awaiting
          </button>
        </div>
        <div className="response-table-head">
          <span>Employee</span>
          <span>Assignment</span>
          <span>Response</span>
          <span>Time / note</span>
          <span>Action</span>
        </div>
        {visible.map(
          ({ person, response }) =>
            person && (
              <div
                className={`response-row ${response.status}`}
                key={person.id}
              >
                <div>
                  <span className="person-avatar">{person.initials}</span>
                  <span>
                    <b>{person.name}</b>
                    <small>
                      {person.role} · {person.department}
                    </small>
                  </span>
                </div>
                <span>
                  <b>{person.facility}</b>
                  <small>{person.building}</small>
                </span>
                <span className={`response-status ${response.status}`}>
                  {response.status === "safe"
                    ? "Confirmed safe"
                    : response.status === "assistance"
                      ? "Needs assistance"
                      : "Awaiting response"}
                </span>
                <span>
                  <b>{response.respondedAt}</b>
                  <small>
                    {response.note ||
                      (response.reminded
                        ? "Reminder sent"
                        : "No additional note")}
                  </small>
                </span>
                <span>
                  {response.status === "awaiting" && (
                    <button onClick={() => remind([person.id])}>Remind</button>
                  )}
                  {response.status === "assistance" && (
                    <button
                      className="danger"
                      disabled={!response.assistanceId}
                      onClick={() => escalate(response, person.name)}
                    >
                      {response.escalated ? "Escalated" : "Escalate"}
                    </button>
                  )}
                  {response.status === "safe" && <Check size={17} />}
                </span>
              </div>
            ),
        )}
      </div>
      <div className="response-audit panel">
        <PanelHeader
          title="Incident response audit"
          subtitle="Events the backend will retain as an immutable timeline"
        />
        <div className="audit-events">
          {responses
            .filter((response) => response.status !== "awaiting")
            .map((response) => {
              const person = recipients.find(
                (candidate) => candidate.id === response.personId,
              );
              return (
                <div
                  className={response.status === "assistance" ? "danger" : ""}
                  key={response.personId}
                >
                  {response.status === "assistance" ? (
                    <LifeBuoy size={17} />
                  ) : (
                    <CheckCircle2 size={17} />
                  )}
                  <span>
                    <b>
                      {person?.name || "Employee"}{" "}
                      {response.status === "assistance"
                        ? "requested assistance"
                        : "confirmed safe"}
                    </b>
                    <small>Mobile app · {response.respondedAt}</small>
                  </span>
                </div>
              );
            })}
          {!responses.some((response) => response.status !== "awaiting") && (
            <p>No employee response events have been received yet.</p>
          )}
        </div>
      </div>
    </>
  );
}

function FacilitiesPage({
  tenantId,
  facilities,
  onChange,
}: {
  tenantId: string;
  facilities: Facility[];
  onChange: (facilities: Facility[]) => void;
}) {
  const tenantFacilities = facilities.filter(
    (item) => item.tenantId === tenantId,
  );
  const firstFacilityId = tenantFacilities[0]?.id;
  const [selectedId, setSelectedId] = useState(firstFacilityId);
  const [editing, setEditing] = useState<Facility | null>(null);
  useEffect(() => setSelectedId(firstFacilityId), [tenantId, firstFacilityId]);
  const selected =
    tenantFacilities.find((item) => item.id === selectedId) ??
    tenantFacilities[0];
  if (!selected)
    return (
      <EmptyState
        title="No facilities configured"
        text="Add your first facility to start location-based alerts."
      />
    );
  return (
    <>
      <div className="context-note">
        <MapPin size={18} />
        <p>
          <b>How location targeting works</b> Administrators model each client
          site as a facility with buildings. An alert can target the entire
          organisation, one facility, or the people assigned to a specific
          building.
        </p>
      </div>
      <div className="facility-layout">
        <div className="facility-list">
          {tenantFacilities.map((item) => (
            <button
              key={item.id}
              className={selected.id === item.id ? "selected" : ""}
              onClick={() => setSelectedId(item.id)}
            >
              <span className="facility-icon">
                <Building2 size={20} />
              </span>
              <span>
                <b>{item.name}</b>
                <small>{item.city}</small>
                <em>
                  {item.buildings.length} buildings · {item.people} people
                </em>
              </span>
              <ChevronRight size={18} />
            </button>
          ))}
        </div>
        <div className="panel facility-detail">
          <div className="facility-detail-head">
            <div>
              <span className="live-chip">
                <i /> CONNECTED
              </span>
              <h2>{selected.name}</h2>
              <p>
                <MapPin size={15} />
                {selected.address}
              </p>
            </div>
            <button
              className="secondary-button"
              onClick={() => setEditing(selected)}
            >
              <Settings size={16} />
              Manage
            </button>
          </div>
          <div className="site-map">
            <div className="site-grid" />
            <div className="site-road horizontal" />
            <div className="site-road vertical" />
            {selected.buildings.map((building) => (
              <button
                key={building.id}
                title={`Edit ${building.name}`}
                onClick={() => setEditing(selected)}
                className={`site-building ${building.status}`}
                style={{
                  left: `${building.x}%`,
                  top: `${building.y}%`,
                  width: `${building.w}%`,
                  height: `${building.h}%`,
                }}
              >
                <Building2 size={20} />
                <b>{building.name}</b>
                <span>{building.people} people</span>
              </button>
            ))}
            <div className="north">
              N<span>↑</span>
            </div>
            <div className="map-scale">50 m</div>
          </div>
          <div className="building-summary">
            <span>
              <b>{selected.people}</b> people on site
            </span>
            <span>
              <b>{selected.buildings.length}</b> buildings
            </span>
            <span>
              <b>
                {
                  selected.buildings.filter((item) => item.status !== "clear")
                    .length
                }
              </b>{" "}
              areas need attention
            </span>
          </div>
        </div>
      </div>
      {editing && (
        <FacilityEditorModal
          tenantId={tenantId}
          facility={editing}
          onClose={() => setEditing(null)}
          onDelete={() => {
            onChange(facilities.filter((item) => item.id !== editing.id));
            setEditing(null);
          }}
          onSave={(next) => {
            onChange(
              facilities.map((item) => (item.id === next.id ? next : item)),
            );
            setEditing(null);
          }}
        />
      )}
    </>
  );
}

function TemplatesPage({
  templates,
  categories,
  onCategoriesChange,
  onUse,
  onChange,
}: {
  templates: MessageTemplate[];
  categories: string[];
  onCategoriesChange: (categories: string[]) => void;
  onUse: (preset: MessageTemplate) => void;
  onChange: (templates: MessageTemplate[]) => void;
}) {
  const [editing, setEditing] = useState<MessageTemplate | null>(null);
  return (
    <>
      <div className="context-note">
        <FileText size={18} />
        <p>
          <b>Templates control alert behavior</b> Each template fixes the alert
          level, delivery channels and acknowledgement policy. A sender only
          chooses the alert type, audience, and completes the message.
        </p>
      </div>
      <div className="template-grid">
        {templates.map((template) => (
          <div className="template-card" key={template.id}>
            <div>
              <span className={`severity-icon ${template.severity}`}>
                <FileText size={18} />
              </span>
              <span className={`severity-label ${template.severity}`}>
                {template.category}
              </span>
              <button
                title={`Edit ${template.title}`}
                onClick={() => setEditing(template)}
              >
                <MoreHorizontal size={18} />
              </button>
            </div>
            <h3>{template.title}</h3>
            <p>{template.message}</p>
            <ChannelPills channels={template.channels} />
            <footer>
              <span>
                {template.requiresAcknowledgement
                  ? "Acknowledgement required"
                  : "No acknowledgement"}
              </span>
              <button onClick={() => onUse(template)}>
                Use template <ChevronRight size={15} />
              </button>
            </footer>
          </div>
        ))}
      </div>
      {editing && (
        <TemplateEditorModal
          tenantId={editing.tenantId}
          template={editing}
          categories={categories}
          onCategoriesChange={onCategoriesChange}
          onClose={() => setEditing(null)}
          onDelete={() => {
            onChange(templates.filter((item) => item.id !== editing.id));
            setEditing(null);
          }}
          onSave={(next) => {
            onChange(
              templates.map((item) => (item.id === next.id ? next : item)),
            );
            setEditing(null);
          }}
        />
      )}
    </>
  );
}

function RolesPage({
  roles,
  portalUsers,
  onReload,
  onNotify,
}: {
  roles: ApiRole[];
  portalUsers: Recipient[];
  onReload: () => Promise<void>;
  onNotify: (message: string) => void;
}) {
  const [editing, setEditing] = useState<ApiRole | null>(null);
  const [inviting, setInviting] = useState(false);
  const [permissions, setPermissions] = useState<ApiPermission[]>([]);
  const [approvalEnabled, setApprovalEnabled] = useState(true);
  useEffect(() => {
    api
      .permissions()
      .then(setPermissions)
      .catch(() => onNotify("Unable to load role permissions"));
    api
      .settings()
      .then((value) =>
        setApprovalEnabled(value.preferences.critical_alert_approval),
      )
      .catch(() => undefined);
  }, [onNotify]);
  const save = async (role: ApiRole) => {
    try {
      const payload = {
        name: role.name,
        description: role.description || "",
        audience: role.audience,
        permissions: role.permissions,
        isActive: role.is_active,
      };
      if (role.id) await api.updateRole(role.id, payload);
      else await api.createRole(payload);
      await onReload();
      setEditing(null);
      onNotify(role.id ? "Role updated" : "Role created");
    } catch (error) {
      onNotify(
        error instanceof SignalOpsApiError
          ? error.message
          : "Unable to save role",
      );
    }
  };
  const toggleApproval = async () => {
    try {
      const next = !approvalEnabled;
      await api.updateSettings({ criticalAlertApproval: next });
      setApprovalEnabled(next);
      onNotify(`Approval workflow ${next ? "enabled" : "disabled"}`);
    } catch (error) {
      onNotify(
        error instanceof SignalOpsApiError
          ? error.message
          : "Unable to update approval policy",
      );
    }
  };
  const tones = ["purple", "red", "blue", "green", "grey"];
  return (
    <>
      <div className="context-note">
        <ShieldCheck size={18} />
        <p>
          <b>Governance without slowing emergencies</b> Routine senders follow
          the configured approval workflow. Emergency controllers and
          organisation administrators retain a clearly audited bypass for
          immediate threats.
        </p>
      </div>
      <div className="governance-grid">
        <div className="panel roles-panel">
          <PanelHeader
            title="Workspace roles"
            subtitle="Permissions follow least-privilege access"
            action={
              <div className="page-actions">
                <button
                  className="secondary-button"
                  onClick={() => setInviting(true)}
                >
                  <Mail size={16} />
                  Invite portal user
                </button>
                <button
                  className="secondary-button"
                  onClick={() =>
                    setEditing({
                      id: "",
                      name: "",
                      description: "",
                      audience: "portal",
                      is_system: false,
                      is_active: true,
                      permissions: ["workspace.read"],
                      user_count: 0,
                    })
                  }
                >
                  <Plus size={16} />
                  Create role
                </button>
              </div>
            }
          />
          {roles.map((role, index) => (
            <div className="role-row" key={role.id}>
              <span className={`role-icon ${tones[index % tones.length]}`}>
                <LockKeyhole size={18} />
              </span>
              <div>
                <b>{role.name}</b>
                <small>{role.description}</small>
              </div>
              <span>{role.user_count} people</span>
              <button
                title={`Manage ${role.name}`}
                onClick={() => setEditing(role)}
              >
                <MoreHorizontal size={18} />
              </button>
            </div>
          ))}
          <div className="section-heading">
            <div>
              <b>Portal users</b>
              <small>Administrators and operational portal access</small>
            </div>
          </div>
          {portalUsers.map((person) => (
            <div className="role-row" key={person.id}>
              <span className="person-avatar">{person.initials}</span>
              <div>
                <b>{person.name}</b>
                <small>{person.email}</small>
              </div>
              <span className={`status-pill ${person.status}`}>
                {person.status}
              </span>
              <button
                title={
                  person.status === "invited"
                    ? `Resend invitation to ${person.name}`
                    : `${person.name} is active`
                }
                disabled={person.status !== "invited"}
                onClick={async () => {
                  try {
                    await api.resendInvitation(person.id);
                    onNotify("Portal invitation sent");
                  } catch (error) {
                    onNotify(
                      error instanceof SignalOpsApiError
                        ? error.message
                        : "Unable to resend invitation",
                    );
                  }
                }}
              >
                <Mail size={17} />
              </button>
            </div>
          ))}
        </div>
        <div className="panel approval-panel">
          <PanelHeader
            title="Approval workflow"
            subtitle="Workspace release policy"
          />
          <div className="policy-status">
            <CheckCircle2 size={19} />
            <span>
              <b>
                Role-based approval is{" "}
                {approvalEnabled ? "enabled" : "disabled"}
              </b>
              <small>
                {approvalEnabled
                  ? "Critical alerts are protected by policy"
                  : "Authorized senders release alerts directly"}
              </small>
            </span>
          </div>
          <div className="approval-flow">
            <div>
              <span className="flow-number">1</span>
              <p>
                <b>Alert created</b>
                <small>Communication manager submits a critical alert</small>
              </p>
            </div>
            <i />
            <div>
              <span className="flow-number">2</span>
              <p>
                <b>Approval requested</b>
                <small>Emergency controllers are notified instantly</small>
              </p>
            </div>
            <i />
            <div>
              <span className="flow-number">3</span>
              <p>
                <b>Alert released</b>
                <small>First approval sends through selected channels</small>
              </p>
            </div>
          </div>
          <div className="bypass-note">
            <Zap size={18} />
            <div>
              <b>Emergency bypass</b>
              <p>
                Emergency controllers and organisation administrators can send
                immediately when every second matters.
              </p>
            </div>
          </div>
          <button className="secondary-button wide" onClick={toggleApproval}>
            {approvalEnabled
              ? "Disable approval workflow"
              : "Enable approval workflow"}
          </button>
        </div>
      </div>
      {editing && (
        <RoleEditorModal
          role={editing}
          permissions={permissions}
          onClose={() => setEditing(null)}
          onSave={save}
        />
      )}
      {inviting && (
        <InvitePortalUserModal
          roles={roles.filter((role) => role.audience === "portal")}
          onClose={() => setInviting(false)}
          onSave={async (value) => {
            try {
              await api.createUser(value);
              await onReload();
              setInviting(false);
              onNotify("Portal invitation sent");
            } catch (error) {
              onNotify(
                error instanceof SignalOpsApiError
                  ? error.message
                  : "Unable to invite portal user",
              );
            }
          }}
        />
      )}
    </>
  );
}

function AccountPasswordPage() {
  const token = new URLSearchParams(window.location.search).get("token") || "";
  const [account, setAccount] = useState<{
    full_name: string;
    email: string;
    tenant_name: string;
  } | null>(null);
  const [validating, setValidating] = useState(true);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [complete, setComplete] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!token) {
      setError("This activation link is incomplete.");
      setValidating(false);
      return;
    }
    api
      .validateInvitation(token)
      .then(setAccount)
      .catch((problem) =>
        setError(
          problem instanceof SignalOpsApiError
            ? problem.message
            : "This activation link is invalid or expired.",
        ),
      )
      .finally(() => setValidating(false));
  }, [token]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (password.length < 10) {
      setError("Use a password with at least 10 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }
    if (!token) {
      setError("This link is incomplete.");
      return;
    }
    setSaving(true);
    try {
      await api.activateAccount(token, password);
      setComplete(true);
    } catch (problem) {
      setError(
        problem instanceof SignalOpsApiError
          ? problem.message
          : "Unable to save the password.",
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <main className="login-page">
      <section className="login-card">
        <div className="login-form-section">
          <h1>
            {complete
              ? "Password saved"
              : "Activate your account"}
          </h1>
          <p>
            {complete
              ? "Your account is ready to use."
              : validating
                ? "Checking your secure link…"
                : account
                  ? `${account.full_name}, finish setting up your ${account.tenant_name} account.`
                  : "Enter and confirm your new password."}
          </p>
          {complete ? (
            <button
              className="login-submit"
              onClick={() => {
                window.location.href = "/";
              }}
            >
              Continue to sign in
            </button>
          ) : (
            <form onSubmit={submit}>
              <label htmlFor="new-password">New password</label>
              <div className="login-password">
                <input
                  id="new-password"
                  className="login-input"
                  type={showPassword ? "text" : "password"}
                  minLength={10}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
              <label htmlFor="confirm-password">Confirm password</label>
              <input
                id="confirm-password"
                className="login-input"
                type={showPassword ? "text" : "password"}
                minLength={10}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
              />
              {error && <div className="login-error">{error}</div>}
              <button
                className="login-submit"
                disabled={validating || saving || !account}
              >
                {saving ? "Saving…" : "Activate account"}
              </button>
            </form>
          )}
        </div>
        <aside
          className="login-visual"
          aria-label="Secure SignalOps account setup"
        >
          <div className="blob blob-1" />
          <div className="blob blob-2" />
          <div className="blob blob-3" />
          <img
            className="astronaut-image"
            src="/images/astro.png"
            alt="Astronaut floating in space"
          />
        </aside>
      </section>
    </main>
  );
}

function PasswordRecoveryPage() {
  const initialEmail = new URLSearchParams(window.location.search).get("email") || "";
  const [stage, setStage] = useState<"request" | "verify" | "password" | "complete">("request");
  const [email, setEmail] = useState(initialEmail);
  const [otp, setOtp] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const problemMessage = (problem: unknown, fallback: string) =>
    problem instanceof SignalOpsApiError ? problem.message : fallback;

  const requestCode = async (event?: FormEvent) => {
    event?.preventDefault();
    setError("");
    setMessage("");
    if (!email.trim() || !/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError("Enter a valid email address.");
      return;
    }
    setLoading(true);
    try {
      const result = await api.forgotPassword(email.trim());
      setStage("verify");
      setOtp("");
      setMessage(`${result.message}. Check your inbox and spam folder.`);
    } catch (problem) {
      setError(problemMessage(problem, "Unable to send a verification code."));
    } finally {
      setLoading(false);
    }
  };

  const verifyCode = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setMessage("");
    if (!/^\d{6}$/.test(otp)) {
      setError("Enter the six-digit code from your email.");
      return;
    }
    setLoading(true);
    try {
      const result = await api.verifyPasswordReset(email.trim(), otp);
      setResetToken(result.resetToken);
      setStage("password");
    } catch (problem) {
      setError(problemMessage(problem, "Unable to verify the code."));
    } finally {
      setLoading(false);
    }
  };

  const savePassword = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (password.length < 10) {
      setError("Use a password with at least 10 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }
    if (!resetToken) {
      setError("Your password reset session has expired. Request a new code.");
      setStage("request");
      return;
    }
    setLoading(true);
    try {
      await api.resetPassword(resetToken, password);
      setResetToken("");
      setStage("complete");
    } catch (problem) {
      setError(problemMessage(problem, "Unable to reset the password."));
    } finally {
      setLoading(false);
    }
  };

  const heading = stage === "request"
    ? "Forgot your password?"
    : stage === "verify"
      ? "Check your email"
      : stage === "password"
        ? "Choose a new password"
        : "Password reset";
  const description = stage === "request"
    ? "Enter your administrator email and we’ll send you a verification code."
    : stage === "verify"
      ? `Enter the six-digit code sent to ${email.trim()}.`
      : stage === "password"
        ? "Create a password with at least 10 characters."
        : "Your password has been changed. You can now sign in.";

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="login-form-section recovery-form-section">
          <h1>{heading}</h1>
          <p>{description}</p>

          {stage === "request" && (
            <form onSubmit={requestCode}>
              <label htmlFor="recovery-email">Email</label>
              <input
                id="recovery-email"
                className="login-input"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                autoFocus
                required
              />
              {error && <div className="login-error" role="alert">{error}</div>}
              <button className="login-submit" disabled={loading}>
                {loading ? "Sending…" : "Send verification code"}
              </button>
            </form>
          )}

          {stage === "verify" && (
            <form onSubmit={verifyCode}>
              <label htmlFor="recovery-otp">Verification code</label>
              <input
                id="recovery-otp"
                className="login-input recovery-otp"
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                value={otp}
                onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
                autoComplete="one-time-code"
                autoFocus
                required
              />
              {message && <div className="info-note" role="status"><Mail size={17} /><span>{message}</span></div>}
              {error && <div className="login-error" role="alert">{error}</div>}
              <button className="login-submit" disabled={loading || otp.length !== 6}>
                {loading ? "Verifying…" : "Verify code"}
              </button>
              <div className="recovery-actions">
                <button type="button" className="text-button" disabled={loading} onClick={() => requestCode()}>
                  Resend code
                </button>
                <button type="button" className="text-button" onClick={() => { setStage("request"); setError(""); setMessage(""); }}>
                  Change email
                </button>
              </div>
            </form>
          )}

          {stage === "password" && (
            <form onSubmit={savePassword}>
              <label htmlFor="recovery-password">New password</label>
              <div className="login-password">
                <input
                  id="recovery-password"
                  className="login-input"
                  type={showPassword ? "text" : "password"}
                  minLength={10}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="new-password"
                  autoFocus
                  required
                />
                <button type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((value) => !value)}>
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
              <label htmlFor="recovery-password-confirm">Confirm password</label>
              <input
                id="recovery-password-confirm"
                className="login-input"
                type={showPassword ? "text" : "password"}
                minLength={10}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
                required
              />
              {error && <div className="login-error" role="alert">{error}</div>}
              <button className="login-submit" disabled={loading}>
                {loading ? "Saving…" : "Reset password"}
              </button>
            </form>
          )}

          {stage === "complete" && (
            <button className="login-submit" onClick={() => { window.location.href = "/"; }}>
              Continue to sign in
            </button>
          )}

          {stage !== "complete" && (
            <button type="button" className="recovery-back text-button" onClick={() => { window.location.href = "/"; }}>
              Back to sign in
            </button>
          )}
        </div>
        <aside className="login-visual" aria-label="Secure SignalOps password recovery">
          <div className="blob blob-1" />
          <div className="blob blob-2" />
          <div className="blob blob-3" />
          <img className="astronaut-image" src="/images/astro.png" alt="Astronaut floating in space" />
        </aside>
      </section>
    </main>
  );
}

function RoleEditorModal({
  role,
  permissions,
  onClose,
  onSave,
}: {
  role: ApiRole;
  permissions: ApiPermission[];
  onClose: () => void;
  onSave: (role: ApiRole) => void;
}) {
  const [draft, setDraft] = useState(role);
  const available = permissions.filter(
    (permission) => permission.audience === draft.audience,
  );
  const togglePermission = (code: string) =>
    setDraft((current) => ({
      ...current,
      permissions: current.permissions.includes(code)
        ? current.permissions.filter((item) => item !== code)
        : [...current.permissions, code],
    }));
  return (
    <div className="modal-backdrop">
      <form
        className="small-modal"
        onSubmit={(event) => {
          event.preventDefault();
          if (draft.permissions.length) onSave(draft);
        }}
      >
        <div className="modal-header">
          <h2>{role.id ? "Edit workspace role" : "Create workspace role"}</h2>
          <button type="button" onClick={onClose}>
            <X size={21} />
          </button>
        </div>
        <div className="small-modal-body">
          <label>Role name</label>
          <input
            className="form-input"
            required
            value={draft.name}
            onChange={(event) =>
              setDraft((current) => ({ ...current, name: event.target.value }))
            }
          />
          <label>Description</label>
          <textarea
            className="form-input"
            rows={3}
            value={draft.description || ""}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                description: event.target.value,
              }))
            }
          />
          <label>Audience</label>
          <select
            className="form-input"
            disabled={role.is_system}
            value={draft.audience}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                audience: event.target.value as ApiRole["audience"],
                permissions: [],
              }))
            }
          >
            <option value="portal">Portal users</option>
            <option value="employee">Employees</option>
          </select>
          <label>Permissions</label>
          <div className="member-picker">
            {available.map((permission) => (
              <label key={permission.code}>
                <input
                  type="checkbox"
                  checked={draft.permissions.includes(permission.code)}
                  onChange={() => togglePermission(permission.code)}
                />
                <span>
                  <b>{permission.code}</b>
                  <small>{permission.description}</small>
                </span>
              </label>
            ))}
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="text-button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="primary-button"
            disabled={!draft.permissions.length}
          >
            <Check size={16} />
            Save role
          </button>
        </div>
      </form>
    </div>
  );
}

function InvitePortalUserModal({
  roles,
  onClose,
  onSave,
}: {
  roles: ApiRole[];
  onClose: () => void;
  onSave: (value: {
    accountType: "admin";
    fullName: string;
    email: string;
    roleIds: string[];
  }) => void;
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [roleId, setRoleId] = useState(
    roles.find((role) => role.name === "Viewer")?.id || roles[0]?.id || "",
  );
  return (
    <div className="modal-backdrop">
      <form
        className="small-modal"
        onSubmit={(event) => {
          event.preventDefault();
          onSave({
            accountType: "admin",
            fullName: fullName.trim(),
            email: email.trim(),
            roleIds: roleId ? [roleId] : [],
          });
        }}
      >
        <div className="modal-header">
          <div>
            <span className="eyebrow">PORTAL ACCESS</span>
            <h2>Invite administrator</h2>
          </div>
          <button type="button" onClick={onClose}>
            <X size={21} />
          </button>
        </div>
        <div className="small-modal-body">
          <label>Full name</label>
          <input
            className="form-input"
            required
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
          />
          <label>Work email</label>
          <input
            className="form-input"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <label>Portal role</label>
          <select
            className="form-input"
            required
            value={roleId}
            onChange={(event) => setRoleId(event.target.value)}
          >
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </select>
          <div className="info-note">
            <Mail size={18} />
            <span>
              The user will receive an activation email and choose their own
              password.
            </span>
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="text-button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-button" disabled={!roleId}>
            <Send size={16} />
            Send invitation
          </button>
        </div>
      </form>
    </div>
  );
}

function SettingsPage({ onNotify }: { onNotify: (message: string) => void }) {
  const [preferences, setPreferences] = useState<ApiTenantSettings | null>(
    null,
  );
  const [channels, setChannels] = useState<ApiChannelSetting[]>([]);
  const reload = useCallback(async () => {
    try {
      const value = await api.settings();
      setPreferences(value.preferences);
      setChannels(value.channels);
    } catch (error) {
      onNotify(
        error instanceof SignalOpsApiError
          ? error.message
          : "Unable to load settings",
      );
    }
  }, [onNotify]);
  useEffect(() => {
    void reload();
  }, [reload]);
  const updatePreference = async (value: Record<string, unknown>) => {
    try {
      setPreferences(await api.updateSettings(value));
      onNotify("Workspace settings updated");
    } catch (error) {
      onNotify(
        error instanceof SignalOpsApiError
          ? error.message
          : "Unable to update settings",
      );
    }
  };
  return (
    <div className="settings-grid">
      <div className="panel settings-panel">
        <PanelHeader
          title="Delivery channels"
          subtitle="Provider connections for India"
        />
        {channels.map((setting) => (
          <ChannelSetting
            key={setting.id}
            setting={setting}
            onSaved={reload}
            onNotify={onNotify}
          />
        ))}
        {!channels.length && (
          <EmptyState
            title="No delivery channels"
            text="Channel settings will appear after the workspace loads."
          />
        )}
      </div>
      <div className="panel preferences-panel">
        <PanelHeader
          title="Emergency defaults"
          subtitle="Applied to new critical alerts"
        />
        <ToggleSetting
          title="Require acknowledgement"
          detail="Recipients must confirm they are safe"
          enabled={preferences?.require_critical_acknowledgement ?? true}
          onToggle={() =>
            updatePreference({
              requireCriticalAcknowledgement:
                !preferences?.require_critical_acknowledgement,
            })
          }
        />
        <ToggleSetting
          title="Require critical-alert approval"
          detail="A different authorised user reviews critical alerts"
          enabled={preferences?.critical_alert_approval ?? true}
          onToggle={() =>
            updatePreference({
              criticalAlertApproval: !preferences?.critical_alert_approval,
            })
          }
        />
        <div className="toggle-setting">
          <div>
            <b>Non-response escalation</b>
            <small>
              Escalate after{" "}
              {preferences?.non_response_escalation_minutes ?? 10} minutes
            </small>
          </div>
          <button
            className="filter-button"
            onClick={() =>
              updatePreference({
                nonResponseEscalationMinutes:
                  preferences?.non_response_escalation_minutes === 10 ? 15 : 10,
              })
            }
          >
            Change
          </button>
        </div>
        <div className="settings-callout">
          <ShieldCheck size={20} />
          <div>
            <b>Critical messages always bypass quiet hours</b>
            <p>Emergency communication remains available at all times.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ChannelSetting({
  setting,
  onSaved,
  onNotify,
}: {
  setting: ApiChannelSetting;
  onSaved: () => Promise<void>;
  onNotify: (message: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [providerValue, setProviderValue] = useState(setting.provider);
  const [senderValue, setSenderValue] = useState(setting.sender_identity || "");
  const Icon =
    setting.channel === "sms"
      ? MessageSquareText
      : setting.channel === "email"
        ? Mail
        : Smartphone;
  const title =
    setting.channel === "push"
      ? "Mobile app push"
      : setting.channel.toUpperCase();
  const save = async (enabled = setting.is_enabled) => {
    try {
      await api.updateChannel(setting.channel, {
        provider: providerValue,
        senderIdentity: senderValue || undefined,
        configuration: setting.configuration || {},
        isEnabled: enabled,
      });
      await onSaved();
      setEditing(false);
      onNotify(`${title} configuration updated`);
    } catch (error) {
      onNotify(
        error instanceof SignalOpsApiError
          ? error.message
          : "Unable to update channel",
      );
    }
  };
  return (
    <div className="channel-setting">
      <span>
        <Icon size={20} />
      </span>
      <div>
        <b>{title}</b>
        {editing ? (
          <>
            <input
              className="inline-setting-input"
              value={providerValue}
              onChange={(event) => setProviderValue(event.target.value)}
            />
            <input
              className="inline-setting-input"
              value={senderValue}
              onChange={(event) => setSenderValue(event.target.value)}
              placeholder="Sender identity"
            />
          </>
        ) : (
          <>
            <small>{setting.provider}</small>
            <em>
              {setting.sender_identity || "Sender identity not configured"}
            </em>
          </>
        )}
      </div>
      <button
        className={`connected-pill ${setting.is_enabled ? "" : "disabled"}`}
        onClick={() => save(!setting.is_enabled)}
      >
        <i />
        {setting.is_enabled ? "Enabled" : "Disabled"}
      </button>
      <button
        className="filter-button"
        onClick={editing ? () => save() : () => setEditing(true)}
      >
        {editing ? "Save" : "Configure"}
      </button>
    </div>
  );
}

function ToggleSetting({
  title,
  detail,
  enabled = true,
  onToggle,
}: {
  title: string;
  detail: string;
  enabled?: boolean;
  onToggle?: () => void;
}) {
  const [internal, setInternal] = useState(enabled);
  const value = onToggle ? enabled : internal;
  return (
    <div className="toggle-setting">
      <div>
        <b>{title}</b>
        <small>{detail}</small>
      </div>
      <button
        className={`toggle ${value ? "on" : ""}`}
        onClick={() =>
          onToggle ? onToggle() : setInternal((current) => !current)
        }
      >
        <i />
      </button>
    </div>
  );
}

function AlertComposer({
  tenantId,
  facilities,
  recipients,
  groups,
  templates,
  preset,
  onClose,
  onCreate,
}: {
  tenantId: string;
  facilities: Facility[];
  recipients: Recipient[];
  groups: AudienceGroup[];
  templates: MessageTemplate[];
  preset: MessageTemplate | null;
  onClose: () => void;
  onCreate: (
    draft: Omit<
      Broadcast,
      | "id"
      | "tenantId"
      | "createdAt"
      | "createdBy"
      | "delivered"
      | "acknowledged"
      | "failed"
    >,
  ) => void;
}) {
  const tenantFacilities = facilities.filter(
    (item) => item.tenantId === tenantId,
  );
  const [step, setStep] = useState(1);
  const [templateId, setTemplateId] = useState(
    preset?.id ?? templates[0]?.id ?? "",
  );
  const template =
    templates.find((item) => item.id === templateId) ?? templates[0];
  const [message, setMessage] = useState(
    preset?.message ?? templates[0]?.message ?? "",
  );
  const [audienceType, setAudienceType] = useState<
    "location" | "group" | "person"
  >("location");
  const [facility, setFacility] = useState("All facilities");
  const [building, setBuilding] = useState("Entire facility");
  const [groupId, setGroupId] = useState(groups[0]?.id ?? "");
  const [personId, setPersonId] = useState(recipients[0]?.id ?? "");
  const [approval, setApproval] = useState("Send immediately");
  const selectedFacility = tenantFacilities.find(
    (item) => item.name === facility,
  );
  const locationCount =
    facility === "All facilities"
      ? tenantFacilities.reduce((sum, item) => sum + item.people, 0)
      : building === "Entire facility"
        ? (selectedFacility?.people ?? 0)
        : (selectedFacility?.buildings.find((item) => item.name === building)
            ?.people ?? 0);
  const selectedGroup = groups.find((item) => item.id === groupId);
  const selectedPerson = recipients.find((item) => item.id === personId);
  const count =
    audienceType === "location"
      ? locationCount
      : audienceType === "group"
        ? (selectedGroup?.memberIds.length ?? 0)
        : selectedPerson
          ? 1
          : 0;
  const audience =
    audienceType === "location"
      ? facility === "All facilities"
        ? "Everyone across all locations"
        : building === "Entire facility"
          ? `Everyone at ${facility}`
          : `Everyone in ${building}`
      : audienceType === "group"
        ? (selectedGroup?.name ?? "Selected group")
        : (selectedPerson?.name ?? "Selected person");
  const targetLocation =
    audienceType === "location"
      ? building === "Entire facility"
        ? facility
        : `${facility} · ${building}`
      : audienceType === "person"
        ? `${selectedPerson?.facility ?? ""} · ${selectedPerson?.building ?? ""}`
        : "Multiple locations";
  const canContinue = Boolean(template && message.trim());
  const chooseTemplate = (id: string) => {
    setTemplateId(id);
    const next = templates.find((item) => item.id === id);
    if (next) setMessage(next.message);
  };

  if (!template)
    return (
      <div className="modal-backdrop">
        <div className="small-modal">
          <div className="modal-header">
            <h2>No templates available</h2>
            <button onClick={onClose}>
              <X size={21} />
            </button>
          </div>
          <div className="small-modal-body">
            <p>Create an alert template before sending an alert.</p>
          </div>
        </div>
      </div>
    );

  return (
    <div className="modal-backdrop">
      <div className="composer-modal">
        <div className="modal-header">
          <div>
            <span className="eyebrow">NEW BROADCAST</span>
            <h2>Create an alert</h2>
          </div>
          <button onClick={onClose}>
            <X size={21} />
          </button>
        </div>
        <div className="stepper">
          <span className={step >= 1 ? "active" : ""}>
            <i>1</i>Message
          </span>
          <em />
          <span className={step >= 2 ? "active" : ""}>
            <i>2</i>Audience
          </span>
          <em />
          <span className={step >= 3 ? "active" : ""}>
            <i>3</i>Review & send
          </span>
        </div>
        <div className="modal-body">
          {step === 1 && (
            <div className="form-section">
              <label>Alert type / template</label>
              <select
                className="form-input"
                value={template.id}
                onChange={(event) => chooseTemplate(event.target.value)}
              >
                {templates.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title} · {item.category}
                  </option>
                ))}
              </select>
              <div className="template-policy">
                <span className={`severity-label ${template.severity}`}>
                  {template.severity}
                </span>
                <ChannelPills channels={template.channels} />
                <small>
                  {template.requiresAcknowledgement
                    ? "Acknowledgement required"
                    : "Acknowledgement not required"}
                </small>
              </div>
              <label>Message</label>
              <textarea
                className="form-input"
                rows={7}
                maxLength={480}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Complete the prepared message with the incident details and instructions."
              />
              <div className="field-hint">
                <span>
                  Replace template variables and keep instructions
                  action-oriented.
                </span>
                <b>{message.length}/480</b>
              </div>
            </div>
          )}
          {step === 2 && (
            <div className="form-section">
              <label>Target audience</label>
              <div className="audience-type-options">
                <button
                  className={audienceType === "location" ? "selected" : ""}
                  onClick={() => setAudienceType("location")}
                >
                  <MapPin size={19} />
                  <b>Location</b>
                  <small>Facility or building</small>
                </button>
                <button
                  className={audienceType === "group" ? "selected" : ""}
                  onClick={() => setAudienceType("group")}
                >
                  <UsersRound size={19} />
                  <b>Group</b>
                  <small>Saved group</small>
                </button>
                <button
                  className={audienceType === "person" ? "selected" : ""}
                  onClick={() => setAudienceType("person")}
                >
                  <CircleUserRound size={19} />
                  <b>Individual</b>
                  <small>Single person</small>
                </button>
              </div>
              {audienceType === "location" && (
                <div className="form-grid">
                  <div>
                    <label>Facility</label>
                    <select
                      className="form-input"
                      value={facility}
                      onChange={(event) => {
                        setFacility(event.target.value);
                        setBuilding("Entire facility");
                      }}
                    >
                      <option>All facilities</option>
                      {tenantFacilities.map((item) => (
                        <option key={item.id}>{item.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label>Building / area</label>
                    <select
                      className="form-input"
                      disabled={!selectedFacility}
                      value={building}
                      onChange={(event) => setBuilding(event.target.value)}
                    >
                      <option>Entire facility</option>
                      {selectedFacility?.buildings.map((item) => (
                        <option key={item.id}>{item.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
              {audienceType === "group" && (
                <div>
                  <label>Saved group</label>
                  <select
                    className="form-input"
                    value={groupId}
                    onChange={(event) => setGroupId(event.target.value)}
                  >
                    {groups.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} · {item.memberIds.length} members
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {audienceType === "person" && (
                <div>
                  <label>Person</label>
                  <select
                    className="form-input"
                    value={personId}
                    onChange={(event) => setPersonId(event.target.value)}
                  >
                    {recipients.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} · {item.facility} / {item.building}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="audience-summary">
                <Users size={21} />
                <div>
                  <b>
                    {count} recipient{count === 1 ? "" : "s"} selected
                  </b>
                  <small>{audience}</small>
                </div>
              </div>
            </div>
          )}
          {step === 3 && (
            <div className="review-layout">
              <div>
                <div className={`review-alert ${template.severity}`}>
                  <span className={`severity-label ${template.severity}`}>
                    {template.severity}
                  </span>
                  <h3>{template.title}</h3>
                  <p>{message}</p>
                </div>
                <dl className="review-details">
                  <div>
                    <dt>Recipients</dt>
                    <dd>
                      {count} people · {audience}
                    </dd>
                  </div>
                  <div>
                    <dt>Location</dt>
                    <dd>{targetLocation}</dd>
                  </div>
                  <div>
                    <dt>Channels</dt>
                    <dd>
                      <ChannelPills channels={template.channels} />
                    </dd>
                  </div>
                  <div>
                    <dt>Acknowledgement</dt>
                    <dd>
                      {template.requiresAcknowledgement
                        ? "Required"
                        : "Not required"}
                    </dd>
                  </div>
                </dl>
              </div>
              <aside>
                <label>Release policy</label>
                <button
                  className={`approval-option ${approval === "Send immediately" ? "selected" : ""}`}
                  onClick={() => setApproval("Send immediately")}
                >
                  <i>
                    {approval === "Send immediately" && <Check size={14} />}
                  </i>
                  <span>
                    <b>Send immediately</b>
                    <small>You have emergency controller access</small>
                  </span>
                </button>
                <button
                  className={`approval-option ${approval !== "Send immediately" ? "selected" : ""}`}
                  onClick={() => setApproval("Request approval")}
                >
                  <i>
                    {approval !== "Send immediately" && <Check size={14} />}
                  </i>
                  <span>
                    <b>Request approval</b>
                    <small>Notify another controller to review</small>
                  </span>
                </button>
                <div className="cost-note">
                  <b>Estimated SMS usage</b>
                  <span>
                    {template.channels.includes("sms") ? count : 0} message
                    credits
                  </span>
                </div>
              </aside>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button
            className="text-button"
            onClick={step === 1 ? onClose : () => setStep((value) => value - 1)}
          >
            {step === 1 ? "Cancel" : "Back"}
          </button>
          {step < 3 ? (
            <button
              className="primary-button"
              disabled={!canContinue || (step === 2 && count === 0)}
              onClick={() => setStep((value) => value + 1)}
            >
              Continue <ChevronRight size={17} />
            </button>
          ) : (
            <button
              className={`send-button ${template.severity}`}
              onClick={() => {
                const selectedBuilding = selectedFacility?.buildings.find(
                  (item) => item.name === building,
                );
                const apiAudienceType =
                  audienceType === "group"
                    ? "group"
                    : audienceType === "person"
                      ? "person"
                      : facility === "All facilities"
                        ? "organisation"
                        : building === "Entire facility"
                          ? "facility"
                          : "building";
                const referenceId =
                  apiAudienceType === "organisation"
                    ? null
                    : apiAudienceType === "group"
                      ? groupId
                      : apiAudienceType === "person"
                        ? personId
                        : apiAudienceType === "facility"
                          ? selectedFacility?.id || null
                          : selectedBuilding?.id || null;
                onCreate({
                  title: template.title,
                  message,
                  severity: template.severity,
                  facility: targetLocation,
                  audience,
                  audienceType: apiAudienceType,
                  audienceReferenceId: referenceId,
                  channels: template.channels,
                  recipients: count,
                  requiresAcknowledgement: template.requiresAcknowledgement,
                  status:
                    approval === "Send immediately" ? "active" : "pending",
                });
              }}
            >
              {approval === "Send immediately" ? (
                <>
                  <Send size={17} />
                  Send alert now
                </>
              ) : (
                <>
                  <Clock3 size={17} />
                  Submit for approval
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function AddPersonModal({
  tenantId,
  facilities,
  departments,
  roles,
  onClose,
  onAdd,
}: {
  tenantId: string;
  facilities: Facility[];
  departments: Department[];
  roles: ApiRole[];
  onClose: () => void;
  onAdd: (person: Recipient) => void;
}) {
  const tenantFacilities = facilities.filter(
    (item) => item.tenantId === tenantId,
  );
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("");
  const [roleId, setRoleId] = useState(
    roles.find((item) => item.name === "Employee")?.id || roles[0]?.id || "",
  );
  const [department, setDepartment] = useState(departments[0]?.name ?? "");
  const [facility, setFacility] = useState(tenantFacilities[0]?.name ?? "");
  const [building, setBuilding] = useState(
    tenantFacilities[0]?.buildings[0]?.name ?? "",
  );
  const selectedFacility = tenantFacilities.find(
    (item) => item.name === facility,
  );
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const initials = name
      .split(" ")
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
    const departmentId = departments.find(
      (item) => item.name === department,
    )?.id;
    const facilityId = selectedFacility?.id;
    const buildingId = selectedFacility?.buildings.find(
      (item) => item.name === building,
    )?.id;
    onAdd({
      id: crypto.randomUUID(),
      tenantId,
      name,
      initials,
      email,
      phone,
      role,
      department,
      facility,
      building,
      status: "invited",
      accountType: "employee",
      departmentId,
      facilityId,
      buildingId,
      roleIds: roleId ? [roleId] : [],
    });
  };
  return (
    <div className="modal-backdrop">
      <form className="small-modal" onSubmit={submit}>
        <div className="modal-header">
          <div>
            <span className="eyebrow">DIRECTORY</span>
            <h2>Add a recipient</h2>
          </div>
          <button type="button" onClick={onClose}>
            <X size={21} />
          </button>
        </div>
        <div className="small-modal-body">
          <div className="form-grid">
            <div>
              <label>Full name</label>
              <input
                className="form-input"
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Arun Mehta"
              />
            </div>
            <div>
              <label>Work email</label>
              <input
                className="form-input"
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@company.in"
              />
            </div>
            <div>
              <label>Mobile number</label>
              <input
                className="form-input"
                required
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="+91 98765 43210"
              />
            </div>
            <div>
              <label>Job role</label>
              <input
                className="form-input"
                required
                value={role}
                onChange={(event) => setRole(event.target.value)}
                placeholder="e.g. Safety officer"
              />
            </div>
            <div>
              <label>Department</label>
              <select
                className="form-input"
                required
                value={department}
                onChange={(event) => setDepartment(event.target.value)}
              >
                {departments.map((item) => (
                  <option key={item.id}>{item.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label>App role</label>
              <select
                className="form-input"
                required
                value={roleId}
                onChange={(event) => setRoleId(event.target.value)}
              >
                {roles.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>Facility</label>
              <select
                className="form-input"
                value={facility}
                onChange={(event) => {
                  setFacility(event.target.value);
                  setBuilding(
                    tenantFacilities.find(
                      (item) => item.name === event.target.value,
                    )?.buildings[0]?.name ?? "",
                  );
                }}
              >
                {tenantFacilities.map((item) => (
                  <option key={item.id}>{item.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label>Building / area</label>
              <select
                className="form-input"
                value={building}
                onChange={(event) => setBuilding(event.target.value)}
              >
                {selectedFacility?.buildings.map((item) => (
                  <option key={item.id}>{item.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="info-note">
            <Smartphone size={19} />
            <span>
              The recipient will receive a mobile app invitation after being
              added.
            </span>
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="text-button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-button" type="submit" disabled={!roleId}>
            <Plus size={17} />
            Add recipient
          </button>
        </div>
      </form>
    </div>
  );
}

function AddDepartmentModal({
  tenantId,
  onClose,
  onAdd,
}: {
  tenantId: string;
  onClose: () => void;
  onAdd: (department: Department) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  return (
    <div className="modal-backdrop">
      <form
        className="small-modal"
        onSubmit={(event) => {
          event.preventDefault();
          onAdd({
            id: crypto.randomUUID(),
            tenantId,
            name: name.trim(),
            description: description.trim(),
          });
        }}
      >
        <div className="modal-header">
          <div>
            <span className="eyebrow">DIRECTORY</span>
            <h2>Add a department</h2>
          </div>
          <button type="button" onClick={onClose}>
            <X size={21} />
          </button>
        </div>
        <div className="small-modal-body">
          <label>Department name</label>
          <input
            autoFocus
            className="form-input"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Security"
          />
          <label>Description</label>
          <textarea
            className="form-input"
            rows={4}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="What this department is responsible for"
          />
        </div>
        <div className="modal-footer">
          <button type="button" className="text-button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-button" type="submit">
            <Plus size={17} />
            Add department
          </button>
        </div>
      </form>
    </div>
  );
}

function DepartmentEditorModal({
  department,
  onClose,
  onSave,
  onDelete,
}: {
  department: Department;
  onClose: () => void;
  onSave: (department: Department) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(department.name);
  const [description, setDescription] = useState(department.description);
  return (
    <div className="modal-backdrop">
      <form
        className="small-modal"
        onSubmit={(event) => {
          event.preventDefault();
          onSave({
            ...department,
            name: name.trim(),
            description: description.trim(),
          });
        }}
      >
        <div className="modal-header">
          <h2>Edit department</h2>
          <button type="button" onClick={onClose}>
            <X size={21} />
          </button>
        </div>
        <div className="small-modal-body">
          <label>Name</label>
          <input
            className="form-input"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <label>Description</label>
          <textarea
            className="form-input"
            rows={4}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
        <div className="modal-footer">
          <button
            type="button"
            className="danger-text-button"
            onClick={onDelete}
          >
            Delete department
          </button>
          <button className="primary-button" type="submit">
            <Check size={16} />
            Save changes
          </button>
        </div>
      </form>
    </div>
  );
}

function GroupEditorModal({
  group,
  people,
  onClose,
  onSave,
  onDelete,
}: {
  group: AudienceGroup;
  people: Recipient[];
  onClose: () => void;
  onSave: (group: AudienceGroup) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description);
  const [memberIds, setMemberIds] = useState(group.memberIds);
  const [search, setSearch] = useState("");
  const visible = people.filter((person) =>
    `${person.name} ${person.department} ${person.facility}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <div className="modal-backdrop">
      <form
        className="small-modal"
        onSubmit={(event) => {
          event.preventDefault();
          onSave({ ...group, name, description, memberIds });
        }}
      >
        <div className="modal-header">
          <div>
            <span className="eyebrow">AUDIENCE</span>
            <h2>Manage group</h2>
          </div>
          <button type="button" onClick={onClose}>
            <X size={21} />
          </button>
        </div>
        <div className="small-modal-body">
          <div className="form-grid">
            <div>
              <label>Group name</label>
              <input
                className="form-input"
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div>
              <label>Description</label>
              <input
                className="form-input"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
          </div>
          <label>Members ({memberIds.length})</label>
          <div className="search-box modal-search">
            <Search size={16} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search people"
            />
          </div>
          <div className="member-picker">
            {visible.map((person) => (
              <label key={person.id}>
                <input
                  type="checkbox"
                  checked={memberIds.includes(person.id)}
                  onChange={() =>
                    setMemberIds((current) =>
                      current.includes(person.id)
                        ? current.filter((id) => id !== person.id)
                        : [...current, person.id],
                    )
                  }
                />
                <span className="person-avatar">{person.initials}</span>
                <span>
                  <b>{person.name}</b>
                  <small>
                    {person.department} · {person.facility}
                  </small>
                </span>
              </label>
            ))}
          </div>
        </div>
        <div className="modal-footer">
          <button
            type="button"
            className="danger-text-button"
            onClick={onDelete}
          >
            Delete group
          </button>
          <button className="primary-button" type="submit">
            <Check size={16} />
            Save group
          </button>
        </div>
      </form>
    </div>
  );
}

function PersonEditorModal({
  person,
  departments,
  facilities,
  roles,
  onClose,
  onSave,
  onDelete,
}: {
  person: Recipient;
  departments: Department[];
  facilities: Facility[];
  roles: ApiRole[];
  onClose: () => void;
  onSave: (person: Recipient) => void;
  onDelete: () => void;
}) {
  const [draft, setDraft] = useState(person);
  const selectedFacility = facilities.find(
    (item) => item.name === draft.facility,
  );
  const field = (key: keyof Recipient, value: string) =>
    setDraft((current) => ({ ...current, [key]: value }));
  return (
    <div className="modal-backdrop">
      <form
        className="small-modal"
        onSubmit={(event) => {
          event.preventDefault();
          onSave({
            ...draft,
            initials: draft.name
              .split(" ")
              .map((part) => part[0])
              .join("")
              .slice(0, 2)
              .toUpperCase(),
          });
        }}
      >
        <div className="modal-header">
          <h2>Edit person</h2>
          <button type="button" onClick={onClose}>
            <X size={21} />
          </button>
        </div>
        <div className="small-modal-body">
          <div className="form-grid">
            <div>
              <label>Name</label>
              <input
                className="form-input"
                required
                value={draft.name}
                onChange={(event) => field("name", event.target.value)}
              />
            </div>
            <div>
              <label>Email</label>
              <input
                className="form-input"
                type="email"
                required
                value={draft.email}
                onChange={(event) => field("email", event.target.value)}
              />
            </div>
            <div>
              <label>Phone</label>
              <input
                className="form-input"
                required
                value={draft.phone}
                onChange={(event) => field("phone", event.target.value)}
              />
            </div>
            <div>
              <label>Role</label>
              <input
                className="form-input"
                required
                value={draft.role}
                onChange={(event) => field("role", event.target.value)}
              />
            </div>
            <div>
              <label>Department</label>
              <select
                className="form-input"
                value={draft.department}
                onChange={(event) => field("department", event.target.value)}
              >
                {departments.map((item) => (
                  <option key={item.id}>{item.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label>Status</label>
              <select
                className="form-input"
                value={draft.status}
                onChange={(event) => field("status", event.target.value)}
              >
                <option value="invited">Invited</option>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
                <option value="disabled">Disabled</option>
              </select>
            </div>
            <div>
              <label>App role</label>
              <select
                className="form-input"
                value={draft.roleIds?.[0] || ""}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    roleIds: event.target.value ? [event.target.value] : [],
                  }))
                }
              >
                {roles.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>Facility</label>
              <select
                className="form-input"
                value={draft.facility}
                onChange={(event) => {
                  const facility = facilities.find(
                    (item) => item.name === event.target.value,
                  );
                  setDraft((current) => ({
                    ...current,
                    facility: event.target.value,
                    building: facility?.buildings[0]?.name ?? "",
                  }));
                }}
              >
                {facilities.map((item) => (
                  <option key={item.id}>{item.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label>Building</label>
              <select
                className="form-input"
                value={draft.building}
                onChange={(event) => field("building", event.target.value)}
              >
                {selectedFacility?.buildings.map((item) => (
                  <option key={item.id}>{item.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button
            type="button"
            className="danger-text-button"
            onClick={onDelete}
          >
            Disable person
          </button>
          <button className="primary-button" type="submit">
            <Check size={16} />
            Save changes
          </button>
        </div>
      </form>
    </div>
  );
}

function FacilityEditorModal({
  tenantId,
  facility,
  onClose,
  onSave,
  onDelete,
}: {
  tenantId: string;
  facility?: Facility;
  onClose: () => void;
  onSave: (facility: Facility) => void;
  onDelete?: () => void;
}) {
  const [name, setName] = useState(facility?.name ?? "");
  const [city, setCity] = useState(facility?.city ?? "");
  const [address, setAddress] = useState(facility?.address ?? "");
  const [buildings, setBuildings] = useState<Facility["buildings"]>(
    facility?.buildings ?? [],
  );
  const updateBuilding = (
    id: string,
    patch: Partial<Facility["buildings"][number]>,
  ) =>
    setBuildings((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  const addBuilding = () => {
    const index = buildings.length;
    setBuildings((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        name: "New building",
        people: 0,
        status: "clear",
        x: 8 + (index % 3) * 30,
        y: 12 + Math.floor(index / 3) * 32,
        w: 24,
        h: 22,
      },
    ]);
  };
  return (
    <div className="modal-backdrop">
      <form
        className="composer-modal facility-editor"
        onSubmit={(event) => {
          event.preventDefault();
          onSave({
            id: facility?.id ?? crypto.randomUUID(),
            tenantId,
            name,
            city,
            address,
            people: buildings.reduce((sum, item) => sum + item.people, 0),
            buildings,
          });
        }}
      >
        <div className="modal-header">
          <div>
            <span className="eyebrow">LOCATION</span>
            <h2>{facility ? "Edit facility" : "Add facility"}</h2>
          </div>
          <button type="button" onClick={onClose}>
            <X size={21} />
          </button>
        </div>
        <div className="modal-body">
          <div className="form-grid">
            <div>
              <label>Facility name</label>
              <input
                className="form-input"
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div>
              <label>City / region</label>
              <input
                className="form-input"
                required
                value={city}
                onChange={(event) => setCity(event.target.value)}
              />
            </div>
          </div>
          <label>Address</label>
          <input
            className="form-input"
            required
            value={address}
            onChange={(event) => setAddress(event.target.value)}
          />
          <div className="section-heading">
            <div>
              <b>Buildings and areas</b>
              <small>Facility occupancy is calculated from these areas.</small>
            </div>
            <button
              type="button"
              className="secondary-button"
              onClick={addBuilding}
            >
              <Plus size={16} />
              Add building
            </button>
          </div>
          <div className="building-editor-list">
            {buildings.map((building) => (
              <div key={building.id}>
                <input
                  className="form-input"
                  aria-label="Building name"
                  value={building.name}
                  onChange={(event) =>
                    updateBuilding(building.id, { name: event.target.value })
                  }
                />
                <input
                  className="form-input"
                  aria-label="People count"
                  type="number"
                  min="0"
                  value={building.people}
                  onChange={(event) =>
                    updateBuilding(building.id, {
                      people: Number(event.target.value),
                    })
                  }
                />
                <select
                  className="form-input"
                  aria-label="Building status"
                  value={building.status}
                  onChange={(event) =>
                    updateBuilding(building.id, {
                      status: event.target
                        .value as Facility["buildings"][number]["status"],
                    })
                  }
                >
                  <option value="clear">Clear</option>
                  <option value="warning">Advisory</option>
                  <option value="alert">Active alert</option>
                </select>
                <button
                  type="button"
                  title="Delete building"
                  onClick={() =>
                    setBuildings((current) =>
                      current.filter((item) => item.id !== building.id),
                    )
                  }
                >
                  <X size={17} />
                </button>
              </div>
            ))}
          </div>
        </div>
        <div className="modal-footer">
          {onDelete ? (
            <button
              type="button"
              className="danger-text-button"
              onClick={onDelete}
            >
              Delete facility
            </button>
          ) : (
            <button type="button" className="text-button" onClick={onClose}>
              Cancel
            </button>
          )}
          <button className="primary-button" type="submit">
            <Check size={16} />
            Save facility
          </button>
        </div>
      </form>
    </div>
  );
}

function TemplateEditorModal({
  tenantId,
  template,
  categories,
  onCategoriesChange,
  onClose,
  onSave,
  onDelete,
}: {
  tenantId: string;
  template?: MessageTemplate;
  categories: string[];
  onCategoriesChange: (categories: string[]) => void;
  onClose: () => void;
  onSave: (template: MessageTemplate) => void;
  onDelete?: () => void;
}) {
  const [title, setTitle] = useState(template?.title ?? "");
  const [category, setCategory] = useState(
    template?.category ?? categories[0] ?? "Emergency",
  );
  const [newCategory, setNewCategory] = useState("");
  const [severity, setSeverity] = useState<MessageTemplate["severity"]>(
    template?.severity ?? "critical",
  );
  const [message, setMessage] = useState(template?.message ?? "");
  const [channels, setChannels] = useState<Channel[]>(
    template?.channels ?? ["sms", "email", "android"],
  );
  const [ack, setAck] = useState(template?.requiresAcknowledgement ?? true);
  const toggle = (channel: Channel) =>
    setChannels((current) =>
      current.includes(channel)
        ? current.filter((item) => item !== channel)
        : [...current, channel],
    );
  const addCategory = () => {
    const value = newCategory.trim();
    if (!value) return;
    if (!categories.includes(value)) onCategoriesChange([...categories, value]);
    setCategory(value);
    setNewCategory("");
  };
  return (
    <div className="modal-backdrop">
      <form
        className="small-modal"
        onSubmit={(event) => {
          event.preventDefault();
          if (!channels.length) return;
          onSave({
            id: template?.id ?? crypto.randomUUID(),
            tenantId,
            title,
            category,
            severity,
            message,
            channels,
            requiresAcknowledgement: ack,
          });
        }}
      >
        <div className="modal-header">
          <div>
            <span className="eyebrow">PREPAREDNESS</span>
            <h2>{template ? "Edit template" : "Create template"}</h2>
          </div>
          <button type="button" onClick={onClose}>
            <X size={21} />
          </button>
        </div>
        <div className="small-modal-body">
          <div className="form-grid">
            <div>
              <label>Template name</label>
              <input
                className="form-input"
                required
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>
            <div>
              <label>Category</label>
              <select
                className="form-input"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
              >
                {categories.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </div>
            <div>
              <label>Alert level</label>
              <select
                className="form-input"
                value={severity}
                onChange={(event) => {
                  const value = event.target
                    .value as MessageTemplate["severity"];
                  setSeverity(value);
                  if (value !== "critical") setAck(false);
                }}
              >
                <option value="critical">Critical</option>
                <option value="warning">Advisory</option>
                <option value="info">Information</option>
              </select>
            </div>
            <div>
              <label>Add category</label>
              <div className="inline-field">
                <input
                  className="form-input"
                  value={newCategory}
                  onChange={(event) => setNewCategory(event.target.value)}
                  placeholder="New category"
                />
                <button type="button" onClick={addCategory}>
                  <Plus size={16} />
                </button>
              </div>
            </div>
          </div>
          <label>Prepared message</label>
          <textarea
            className="form-input"
            required
            rows={5}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Use variables such as {{location}} where needed."
          />
          <label>Delivery channels</label>
          <div className="channel-options">
            {(["sms", "email", "android"] as Channel[]).map((channel) => {
              const Icon = channelIcon[channel];
              return (
                <button
                  type="button"
                  key={channel}
                  className={channels.includes(channel) ? "selected" : ""}
                  onClick={() => toggle(channel)}
                >
                  <span>
                    <Icon size={19} />
                  </span>
                  <div>
                    <b>{channelLabel[channel]}</b>
                  </div>
                  <i>{channels.includes(channel) && <Check size={14} />}</i>
                </button>
              );
            })}
          </div>
          <ToggleSetting
            title="Require acknowledgement"
            detail="Recipients must confirm receipt or safety"
            enabled={ack}
            onToggle={() => setAck((value) => !value)}
          />
        </div>
        <div className="modal-footer">
          {onDelete ? (
            <button
              type="button"
              className="danger-text-button"
              onClick={onDelete}
            >
              Delete template
            </button>
          ) : (
            <button type="button" className="text-button" onClick={onClose}>
              Cancel
            </button>
          )}
          <button
            className="primary-button"
            disabled={!channels.length}
            type="submit"
          >
            <Check size={17} />
            Save template
          </button>
        </div>
      </form>
    </div>
  );
}

function ChannelPills({
  channels,
  compact = false,
}: {
  channels: Channel[];
  compact?: boolean;
}) {
  return (
    <span className={`channel-pills ${compact ? "compact" : ""}`}>
      {channels.map((channel) => {
        const Icon = channelIcon[channel];
        return (
          <span key={channel} title={channelLabel[channel]}>
            <Icon size={compact ? 14 : 15} />
            {!compact && channelLabel[channel]}
          </span>
        );
      })}
    </span>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty-state">
      <span className="empty-state-icon">
        <Inbox size={22} />
      </span>
      <div>
        <b>{title}</b>
        <p>{text}</p>
      </div>
    </div>
  );
}

export default App;
