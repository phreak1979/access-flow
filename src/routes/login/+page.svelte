<script lang="ts">
  import { goto } from "$app/navigation";
  import { alert, toast, confirm } from "$lib/alert";

  export let data: { API_URL: string };
  const API_URL: string = data.API_URL;

  let email = "";
  let password = "";
  let error: string | null = null;
  let logginIn: boolean = false;

  async function handleLogin(event: SubmitEvent) {
    event.preventDefault();

    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const err = await res.json();
        await alert("Login failed, username or password error...", "error", "Failed!");
        logginIn = false;

        throw new Error(err.errors?.[0]?.message || "Login failed");
      }

      const { data } = await res.json();

      // Save token in sessionStorage
      const now = Date.now();
      sessionStorage.setItem("token", data.access_token);
      sessionStorage.setItem("refresh_token", data.refresh_token);
      sessionStorage.setItem("expires_at", String(now + data.expires * 1000));

      // Redirect to home (or wherever you want)
      goto("/home");
    } catch (e: unknown) {
      logginIn = false;
      error = e instanceof Error ? e.message : "Unexpected error";
    }
  }
</script>

<svelte:head><title>Access Flow | Login</title></svelte:head>
<div class="login">
  <!-- BEGIN login-content -->
  <div class="login-content">
    <form on:submit={handleLogin} name="login_form">
      <div class="d-flex justify-content-center align-items-center gap-2">
        <img src="images/logo.png" alt="" class="login-logo" style="height:40px;" />
        <h1 class="m-0">Access <span class="flow-highlight">FLOW</span></h1>
      </div>

      <div class="text-body text-opacity-50 text-center mb-5">For your protection, please verify your identity.</div>
      <div class="mb-4">
        <label class="form-label">Email Address</label>
        <input
          type="text"
          class="form-control form-control-lg fs-14px"
          placeholder="username@address.com"
          bind:value={email}
        />
      </div>
      <div class="mb-4">
        <div class="d-flex">
          <label class="form-label">Password</label>
          <a href="#" class="ms-auto text-body text-opacity-50" hidden>Forgot password?</a>
        </div>
        <input
          type="password"
          class="form-control form-control-lg fs-14px"
          bind:value={password}
          placeholder="Enter your password"
        />
      </div>
      <div class="mb-4" hidden>
        <div class="form-check">
          <input class="form-check-input" type="checkbox" value="" id="customCheck1" />
          <label class="form-check-label fw-500" for="customCheck1">Remember me</label>
        </div>
      </div>
      <button
        type="submit"
        class="btn btn-info btn-lg d-block w-100 mb-3 border border-info"
        on:click={() => (logginIn = true)}>{logginIn ? "Logging in..." : "Sign in"}</button
      >
      <div class="text-center text-body text-opacity-50" hidden>
        Don't have an account yet? <a href="page_register.html">Sign up</a>.
      </div>
    </form>
  </div>
  <!-- END login-content -->
</div>

<!-- END login -->

<style>
  .login-logo {
    height: 64px;
  }
  .flow-highlight {
    color: #37a3ff;
  }
</style>
