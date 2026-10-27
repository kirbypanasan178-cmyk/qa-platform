"use client";

import React, { useState, useEffect } from "react";
import { Header } from "@/components/header";
import {
  GitBranch,
  Key,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  Shield,
  HelpCircle,
  Send,
  Unplug,
  Server,
  Layers,
} from "lucide-react";

interface AccessibleRepo {
  id: number;
  fullName: string;
  name: string;
  owner: string;
  isPrivate: boolean;
  description: string | null;
  defaultBranch: string;
  htmlUrl: string;
  canCreateIssues: boolean;
}

interface GitHubSettings {
  projectId: string;
  projectName: string;
  projectKey: string;
  status: "CONNECTED" | "DISCONNECTED" | "NOT_CONFIGURED" | "INVALID_TOKEN";
  isConnected: boolean;
  hasTokenConfigured: boolean;
  tokenSource: "DATABASE" | "ENVIRONMENT" | "NONE";
  tokenType?: "CLASSIC_PAT" | "FINE_GRAINED_PAT" | "APP" | "UNKNOWN" | null;
  tokenWarning?: string | null;
  accountLogin: string | null;
  accountType: string | null;
  installationId: string | null;
  selectedOwner: string | null;
  selectedRepo: string | null;
  selectedRepoFullName: string | null;
  setupInstructions: {
    title: string;
    description: string;
    requiredPermissions: string[];
    tokenGuidance?: string[];
  };
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<GitHubSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Connection form state
  const [tokenInput, setTokenInput] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  // Connection testing state
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<{
    login: string;
    accountType: string;
    latencyMs: number;
  } | null>(null);

  // Repositories state
  const [repos, setRepos] = useState<AccessibleRepo[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [selectedRepoFullName, setSelectedRepoFullName] = useState("");
  const [sandboxTargetRepo, setSandboxTargetRepo] = useState("");
  const [manualOwner, setManualOwner] = useState("");
  const [manualRepo, setManualRepo] = useState("");
  const [isManualEntry, setIsManualEntry] = useState(false);
  const [savingRepo, setSavingRepo] = useState(false);

  // Sandbox testing state
  const [testingIssue, setTestingIssue] = useState(false);
  const [createdTestIssue, setCreatedTestIssue] = useState<{
    number: number;
    url: string;
    title: string;
    targetOwner: string;
    targetRepo: string;
  } | null>(null);

  // Instructions toggle
  const [showInstructions, setShowInstructions] = useState(false);

  // 1. Load accessible repositories
  const loadRepositories = async () => {
    try {
      setLoadingRepos(true);
      const res = await fetch("/api/v1/settings/github/repositories");
      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.message || "Failed to load repositories");
      }

      setRepos(json.data || []);
    } catch (err: unknown) {
      // Don't block whole page if repos load fails (e.g. rate limit), show in error
      setError(err instanceof Error ? err.message : "Failed to load accessible repositories");
    } finally {
      setLoadingRepos(false);
    }
  };

  useEffect(() => {
    let isMounted = true;

    async function initializeSettings() {
      try {
        const res = await fetch("/api/v1/settings/github");
        const json = await res.json();

        if (!res.ok) {
          throw new Error(json.message || "Failed to load settings");
        }

        if (!isMounted) return;

        const data: GitHubSettings = json.data;
        setSettings(data);
        if (data.selectedRepoFullName) {
          setSelectedRepoFullName(data.selectedRepoFullName);
        }
        if (data.selectedOwner) setManualOwner(data.selectedOwner);
        if (data.selectedRepo) setManualRepo(data.selectedRepo);

        if (data.isConnected) {
          try {
            setLoadingRepos(true);
            const repoRes = await fetch("/api/v1/settings/github/repositories");
            const repoJson = await repoRes.json();
            if (isMounted && repoRes.ok) {
              const loadedRepos: AccessibleRepo[] = repoJson.data || [];
              setRepos(loadedRepos);

              const hasValidSelection =
                data.selectedRepoFullName &&
                loadedRepos.some((r) => r.fullName === data.selectedRepoFullName);

              if (hasValidSelection) {
                setSandboxTargetRepo(data.selectedRepoFullName!);
              } else if (loadedRepos.length > 0) {
                setSelectedRepoFullName(loadedRepos[0].fullName);
                setSandboxTargetRepo(loadedRepos[0].fullName);
              }
            }
          } catch {
            // non-fatal
          } finally {
            if (isMounted) setLoadingRepos(false);
          }
        }
      } catch (err: unknown) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : "Error fetching settings");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    initializeSettings();

    return () => {
      isMounted = false;
    };
  }, []);

  // 3. Connect handler
  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setConnecting(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/v1/settings/github/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: tokenInput.trim() ? tokenInput.trim() : undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message || "Failed to connect GitHub integration");
      }

      setSettings(json.data);
      setSuccess("GitHub integration connected successfully!");
      setTokenInput("");
      loadRepositories();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setConnecting(false);
    }
  };

  // 4. Disconnect handler
  const handleDisconnect = async () => {
    if (!confirm("Are you sure you want to disconnect the GitHub integration?")) {
      return;
    }

    setDisconnecting(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/v1/settings/github/disconnect", {
        method: "POST",
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message || "Failed to disconnect");
      }

      setSettings(json.data);
      setRepos([]);
      setTestResult(null);
      setSuccess("GitHub integration disconnected.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Disconnect failed");
    } finally {
      setDisconnecting(false);
    }
  };

  // 5. Test Connection handler
  const handleTestConnection = async () => {
    setTestingConnection(true);
    setError(null);
    setSuccess(null);
    setTestResult(null);

    try {
      const res = await fetch("/api/v1/settings/github/test", {
        method: "POST",
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message || "Connection test failed");
      }

      setTestResult(json.data);
      setSuccess(`Connection verified! Response time: ${json.data.latencyMs}ms`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Connection test failed");
    } finally {
      setTestingConnection(false);
    }
  };

  // 6. Save Repository Selection handler
  const handleSaveRepository = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingRepo(true);
    setError(null);
    setSuccess(null);

    let owner = "";
    let repo = "";

    if (isManualEntry) {
      owner = manualOwner.trim();
      repo = manualRepo.trim();
    } else {
      if (!selectedRepoFullName) {
        setError("Please select a repository from the list");
        setSavingRepo(false);
        return;
      }
      const parts = selectedRepoFullName.split("/");
      owner = parts[0];
      repo = parts[1];
    }

    if (!owner || !repo) {
      setError("Repository owner and name are required");
      setSavingRepo(false);
      return;
    }

    try {
      const res = await fetch("/api/v1/settings/github", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner, repo }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message || "Failed to save repository selection");
      }

      setSettings(json.data);
      setSuccess(`Target repository saved: ${owner}/${repo}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save repository");
    } finally {
      setSavingRepo(false);
    }
  };

  // 7. Sandbox Test Issue Creation handler
  const handleCreateTestIssue = async () => {
    setTestingIssue(true);
    setError(null);
    setSuccess(null);
    setCreatedTestIssue(null);

    const target = sandboxTargetRepo || selectedRepoFullName || settings?.selectedRepoFullName || "";
    if (!target) {
      setError("Please select a target repository for the sandbox test");
      setTestingIssue(false);
      return;
    }

    const parts = target.split("/");
    const owner = parts[0]?.trim();
    const repo = parts[1]?.trim();

    try {
      const res = await fetch("/api/v1/settings/github/test-issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner, repo }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message || "Failed to create sandbox test issue");
      }

      setCreatedTestIssue(json.data);
      setSuccess(
        `Sandbox test issue #${json.data.number} created successfully in ${json.data.targetOwner}/${json.data.targetRepo}!`
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create sandbox issue");
    } finally {
      setTestingIssue(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col">
      <Header
        title="Settings"
        description="Configure target GitHub repositories and issue integration parameters."
      />

      <main className="flex-1 p-8 max-w-5xl space-y-6">
        {/* Alerts Banner */}
        {error && (
          <div className="rounded-xl bg-rose-50 p-4 border border-rose-200 text-sm text-rose-800 dark:bg-rose-950/40 dark:border-rose-900/50 dark:text-rose-300 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 shrink-0 text-rose-600 dark:text-rose-400 mt-0.5" />
            <div className="flex-1">
              <span className="font-semibold">Action Failed: </span>
              {error}
            </div>
          </div>
        )}

        {success && (
          <div className="rounded-xl bg-emerald-50 p-4 border border-emerald-200 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-900/50 dark:text-emerald-300 flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />
            <div className="flex-1">
              <span className="font-semibold">Success: </span>
              {success}
            </div>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="rounded-xl border border-zinc-200 bg-white p-12 text-center shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
            <RefreshCw className="h-6 w-6 animate-spin mx-auto text-zinc-400 mb-2" />
            <p className="text-xs text-zinc-500">Loading settings...</p>
          </div>
        )}

        {!loading && settings && (
          <>
            {/* Card 1: GitHub Connection Status & Authorization */}
            <div className="rounded-xl border border-zinc-200 bg-white shadow-xs dark:border-zinc-800 dark:bg-zinc-900 overflow-hidden">
              <div className="border-b border-zinc-100 p-6 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-lg bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900">
                      <GitBranch className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                        GitHub Integration
                      </h3>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        Manage server-side repository synchronization for automated QA defects.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Connection Status Badge */}
                <div className="flex items-center gap-2">
                  {settings.status === "CONNECTED" && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                      <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                      Connected ({settings.accountLogin ? `@${settings.accountLogin}` : "Active"})
                    </span>
                  )}
                  {settings.status === "DISCONNECTED" && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-950/50 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                      <span className="h-2 w-2 rounded-full bg-amber-500" />
                      Disconnected
                    </span>
                  )}
                  {settings.status === "NOT_CONFIGURED" && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
                      <Key className="h-3 w-3" />
                      Not Configured
                    </span>
                  )}
                </div>
              </div>

              {/* Status details & actions */}
              <div className="p-6 space-y-6">
                {/* Active Target Banner */}
                <div className="rounded-lg bg-zinc-50 p-4 border border-zinc-200/80 dark:bg-zinc-950/50 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="space-y-0.5">
                    <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
                      Currently Selected Repository
                    </span>
                    <div className="flex items-center gap-2">
                      <Layers className="h-4 w-4 text-zinc-400" />
                      {settings.selectedRepoFullName ? (
                        <a
                          href={`https://github.com/${settings.selectedRepoFullName}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-semibold text-zinc-900 hover:text-emerald-600 dark:text-zinc-100 dark:hover:text-emerald-400 inline-flex items-center gap-1 transition-colors"
                        >
                          {settings.selectedRepoFullName}
                          <ExternalLink className="h-3.5 w-3.5 ml-0.5" />
                        </a>
                      ) : (
                        <span className="text-sm text-zinc-400 italic">
                          No repository selected yet
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="text-xs text-zinc-500 flex items-center gap-2">
                    <Server className="h-3.5 w-3.5" />
                    <span>Project: {settings.projectName} ({settings.projectKey})</span>
                  </div>
                </div>

                {/* Token Warning (e.g. Fine-grained token collaborator limitations) */}
                {settings.tokenWarning && settings.isConnected && (
                  <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2.5">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
                    <div>
                      <span className="font-semibold">Collaborator Repositories Note: </span>
                      {settings.tokenWarning}
                    </div>
                  </div>
                )}

                {/* Connection Controls */}
                <div className="flex flex-wrap items-center gap-3">
                  {settings.isConnected ? (
                    <>
                      <button
                        onClick={handleTestConnection}
                        disabled={testingConnection}
                        className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-3.5 py-2 text-xs font-medium text-white shadow-xs hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors"
                      >
                        {testingConnection ? (
                          <>
                            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                            Testing Connection...
                          </>
                        ) : (
                          <>
                            <RefreshCw className="h-3.5 w-3.5" />
                            Test Connection
                          </>
                        )}
                      </button>

                      <button
                        onClick={handleDisconnect}
                        disabled={disconnecting}
                        className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3.5 py-2 text-xs font-medium text-zinc-700 shadow-xs hover:bg-zinc-50 hover:text-rose-600 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-rose-400 transition-colors"
                      >
                        {disconnecting ? (
                          <>
                            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                            Disconnecting...
                          </>
                        ) : (
                          <>
                            <Unplug className="h-3.5 w-3.5" />
                            Disconnect Integration
                          </>
                        )}
                      </button>
                    </>
                  ) : (
                    <form onSubmit={handleConnect} className="w-full space-y-3">
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                          {settings.hasTokenConfigured && settings.tokenSource === "ENVIRONMENT"
                            ? "Connect via Server Environment Token (or provide custom token)"
                            : "Enter GitHub Personal Access Token (PAT) or App Token"}
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="password"
                            placeholder={
                              settings.hasTokenConfigured
                                ? "Use server environment GITHUB_TOKEN (or paste new token)"
                                : "ghp_..."
                            }
                            value={tokenInput}
                            onChange={(e) => setTokenInput(e.target.value)}
                            className="flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-900 shadow-xs placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-hidden dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                          />
                          <button
                            type="submit"
                            disabled={connecting}
                            className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-xs font-medium text-white shadow-xs hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors shrink-0"
                          >
                            {connecting ? (
                              <>
                                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                                Connecting...
                              </>
                            ) : (
                              <>
                                <Key className="h-3.5 w-3.5" />
                                Connect Integration
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                      <p className="text-[11px] text-zinc-500">
                        Tokens are validated server-side and never exposed to the browser. Minimum required scopes: <code>issues:write</code> and <code>metadata:read</code>.
                      </p>
                    </form>
                  )}
                </div>

                {/* Connection Test Diagnostics */}
                {testResult && (
                  <div className="rounded-lg bg-zinc-50 p-3.5 border border-zinc-200 text-xs dark:bg-zinc-950/60 dark:border-zinc-800 space-y-1.5">
                    <div className="font-semibold text-zinc-800 dark:text-zinc-200 flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      Integration Diagnostics
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-zinc-600 dark:text-zinc-400 pt-1">
                      <div>
                        <span className="font-medium text-zinc-500">Account: </span>
                        <span>{testResult.login}</span>
                      </div>
                      <div>
                        <span className="font-medium text-zinc-500">Account Type: </span>
                        <span>{testResult.accountType}</span>
                      </div>
                      <div>
                        <span className="font-medium text-zinc-500">API Latency: </span>
                        <span>{testResult.latencyMs} ms</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Setup Instructions Toggle */}
                <div className="border-t border-zinc-100 dark:border-zinc-800/80 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowInstructions(!showInstructions)}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
                  >
                    <HelpCircle className="h-3.5 w-3.5" />
                    <span>{showInstructions ? "Hide Setup Instructions" : "View Authorization Setup Instructions"}</span>
                  </button>

                  {showInstructions && (
                    <div className="mt-3 p-4 rounded-lg bg-zinc-50 border border-zinc-200 dark:bg-zinc-950/40 dark:border-zinc-800 text-xs space-y-3">
                      <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                        {settings.setupInstructions.title}
                      </div>
                      <p className="text-zinc-600 dark:text-zinc-400">
                        {settings.setupInstructions.description}
                      </p>
                      <div className="space-y-1">
                        <div className="font-medium text-zinc-700 dark:text-zinc-300">
                          Minimum Required Permissions:
                        </div>
                        <ul className="list-disc pl-5 space-y-1 text-zinc-600 dark:text-zinc-400">
                          {settings.setupInstructions.requiredPermissions.map((perm, i) => (
                            <li key={i}>{perm}</li>
                          ))}
                        </ul>
                      </div>
                      {settings.setupInstructions.tokenGuidance && (
                        <div className="space-y-1 pt-1">
                          <div className="font-medium text-zinc-700 dark:text-zinc-300">
                            Token Selection Guidance:
                          </div>
                          <ul className="list-disc pl-5 space-y-1 text-zinc-600 dark:text-zinc-400">
                            {settings.setupInstructions.tokenGuidance.map((guide, i) => (
                              <li key={i}>{guide}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800 text-zinc-500">
                        <span className="font-semibold text-zinc-700 dark:text-zinc-300">Security Note: </span>
                        Tokens are stored server-side with strict sanitization. Browser sessions never receive raw tokens, and stack traces are redacted before sync.
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Card 2: Target Repository Selection */}
            <div className="rounded-xl border border-zinc-200 bg-white shadow-xs dark:border-zinc-800 dark:bg-zinc-900 overflow-hidden">
              <div className="border-b border-zinc-100 p-6 dark:border-zinc-800">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                      Default Repository Selection
                    </h3>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                      Select which GitHub repository should receive defect reports generated from Playwright automation failures.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsManualEntry(!isManualEntry)}
                      className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 underline underline-offset-2"
                    >
                      {isManualEntry ? "Switch to Repositories Dropdown" : "Manual Owner/Repo Entry"}
                    </button>
                  </div>
                </div>
              </div>

              <div className="p-6">
                {!settings.isConnected ? (
                  <div className="rounded-lg bg-zinc-50 p-6 text-center border border-dashed border-zinc-200 dark:bg-zinc-950/40 dark:border-zinc-800">
                    <Shield className="h-6 w-6 text-zinc-400 mx-auto mb-2" />
                    <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                      GitHub Integration Not Connected
                    </p>
                    <p className="text-xs text-zinc-500 mt-1">
                      Connect your GitHub account or App installation above to load accessible repositories.
                    </p>
                  </div>
                ) : (
                  <form onSubmit={handleSaveRepository} className="space-y-4">
                    {!isManualEntry ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                            Accessible Repositories
                          </label>
                          <button
                            type="button"
                            onClick={loadRepositories}
                            disabled={loadingRepos}
                            className="inline-flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                          >
                            <RefreshCw className={`h-3 w-3 ${loadingRepos ? "animate-spin" : ""}`} />
                            Refresh Repositories
                          </button>
                        </div>

                        {loadingRepos ? (
                          <div className="p-4 text-center rounded-lg border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-500">
                            Loading accessible repositories from GitHub...
                          </div>
                        ) : repos.length > 0 ? (
                          <div className="space-y-2">
                            <select
                              value={selectedRepoFullName}
                              onChange={(e) => setSelectedRepoFullName(e.target.value)}
                              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-900 shadow-xs focus:border-zinc-400 focus:outline-hidden dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                            >
                              <option value="">-- Choose an accessible repository --</option>
                              {repos.map((repo) => (
                                <option key={repo.id} value={repo.fullName}>
                                  {repo.fullName} {repo.isPrivate ? "🔒 (Private)" : "🌐 (Public)"} [{repo.defaultBranch}]
                                </option>
                              ))}
                            </select>
                            <p className="text-[11px] text-zinc-500">
                              Displaying {repos.length} accessible repositories with issues permissions.
                            </p>
                          </div>
                        ) : (
                          <div className="p-4 text-center rounded-lg border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-500 space-y-2">
                            <p>No repositories returned by GitHub API or permissions are restricted.</p>
                            <button
                              type="button"
                              onClick={() => setIsManualEntry(true)}
                              className="text-emerald-600 dark:text-emerald-400 font-medium underline"
                            >
                              Enter repository manually
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                            Repository Owner / Org
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. your-github-org"
                            value={manualOwner}
                            onChange={(e) => setManualOwner(e.target.value)}
                            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-900 shadow-xs focus:border-zinc-400 focus:outline-hidden dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                            Repository Name
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. sandbox-repo"
                            value={manualRepo}
                            onChange={(e) => setManualRepo(e.target.value)}
                            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-900 shadow-xs focus:border-zinc-400 focus:outline-hidden dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                          />
                        </div>

                        <div className="sm:col-span-2 text-[11px] text-zinc-500 rounded-md bg-zinc-50 dark:bg-zinc-900/50 p-2.5 border border-zinc-200/80 dark:border-zinc-800">
                          <span className="font-medium text-zinc-700 dark:text-zinc-300">Collaborator Repositories: </span>
                          If targeting a private repository owned by another user account, GitHub requires a Personal Access Token (classic) with <code>repo</code> scope. Fine-grained PATs cannot access other users&apos; private repositories.
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-end gap-3 pt-2">
                      <button
                        type="submit"
                        disabled={savingRepo}
                        className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-medium text-white shadow-xs hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                      >
                        {savingRepo ? (
                          <>
                            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                            Verifying & Saving...
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Save Target Repository
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>

            {/* Card 3: Sandbox Verification & Manual Testing */}
            <div className="rounded-xl border border-zinc-200 bg-white shadow-xs dark:border-zinc-800 dark:bg-zinc-900 overflow-hidden">
              <div className="border-b border-zinc-100 p-6 dark:border-zinc-800">
                <div className="space-y-0.5">
                  <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                    <Send className="h-4 w-4 text-zinc-500" />
                    Sandbox Integration Testing
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Test automated defect issue creation against your configured sandbox repository without affecting production or triggering bulk issues.
                  </p>
                </div>
              </div>

              <div className="p-6 space-y-4">
                <div className="rounded-lg bg-zinc-50 p-4 border border-zinc-200/80 dark:bg-zinc-950/50 dark:border-zinc-800 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex-1 space-y-1">
                      <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                        Target Repository for Sandbox Test:
                      </label>
                      {repos.length > 0 ? (
                        <select
                          value={sandboxTargetRepo}
                          onChange={(e) => setSandboxTargetRepo(e.target.value)}
                          className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-900 shadow-xs focus:border-zinc-400 focus:outline-hidden dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                        >
                          {repos.map((r) => (
                            <option key={r.id} value={r.fullName}>
                              {r.fullName} {r.isPrivate ? "🔒 (Private)" : "🌐 (Public)"}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          value={sandboxTargetRepo || selectedRepoFullName || ""}
                          onChange={(e) => setSandboxTargetRepo(e.target.value)}
                          placeholder="e.g. owner/sandbox-repo"
                          className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-900 shadow-xs focus:border-zinc-400 focus:outline-hidden dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                        />
                      )}
                    </div>

                    <div className="pt-1 sm:pt-5">
                      <button
                        onClick={handleCreateTestIssue}
                        disabled={!settings.isConnected || !sandboxTargetRepo || testingIssue}
                        className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-xs font-medium text-white shadow-xs hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors shrink-0"
                      >
                        {testingIssue ? (
                          <>
                            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                            Creating Test Issue...
                          </>
                        ) : (
                          <>
                            <Send className="h-3.5 w-3.5" />
                            Send Sandbox Test Issue
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  <p className="text-[11px] text-zinc-500">
                    A test issue with title <code>[QA-Platform Test] Sandbox Integration Verification</code> will be created in <strong>{sandboxTargetRepo || "the selected repository"}</strong>.
                  </p>
                </div>
                {createdTestIssue ? (
                  <div className="rounded-lg bg-emerald-50 p-4 border border-emerald-200 text-xs dark:bg-emerald-950/30 dark:border-emerald-900/50 space-y-2">
                    <div className="font-semibold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                      Sandbox Verification Succeeded!
                    </div>
                    <p className="text-emerald-700 dark:text-emerald-400">
                      Issue <strong>#{createdTestIssue.number}</strong> was successfully created in repository <code>{createdTestIssue.targetOwner}/{createdTestIssue.targetRepo}</code>.
                    </p>
                    <div className="pt-2">
                      <a
                        href={createdTestIssue.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 transition-colors"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        View Issue #{createdTestIssue.number} on GitHub
                      </a>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-zinc-500 space-y-1">
                    <p>
                      <strong>How sandbox testing works:</strong> When you click the test button, QA-Platform sends a sanitized verification issue containing metadata and diagnosis blocks to the currently selected repository.
                    </p>
                    <p>
                      You can safely experiment against your sandbox repository, confirm labels and issue formatting, and switch the selected target repository at any time. Existing defects retain their original issue links.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
