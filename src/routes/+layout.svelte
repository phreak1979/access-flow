<script lang="ts">
  import favicon from "$lib/assets/favicon.svg";
  import { page } from "$app/stores";

  type LayoutData = {
    user: string; // or better: your real user object type
  };

  let { children, data } = $props<{ data: LayoutData }>();
  // console.log(data.user.first_name + " " + data.user.last_name);
</script>

<svelte:head>
  <link rel="icon" href={favicon} />
</svelte:head>
{#if $page.url.pathname != "/login"}
  <nav class="navbar navbar-dark bg-dark shadow sticky-top">
    <div class="container-fluid d-flex align-items-center me-2">
      <div class="d-flex align-items-center">
        <img src="/images/logo.png" alt="Logo" height="32" class="me-2" />
        <span class="navbar-brand mb-0 h1">
          Access <span class="brand-highlight">FLOW</span>
        </span>
      </div>

      <ul class="navbar-nav flex-row ms-auto me-2">
        <li class="nav-item me-3">
          <a class="nav-link {$page.url.pathname === '/home' ? 'active' : ''}" href="/home">
            <i class="fa-solid fa-house"></i> Home
          </a>
        </li>
        <li class="nav-item me-3">
          <a class="nav-link {$page.url.pathname === '/workload' ? 'active' : ''}" href="/workload">
            <i class="fa-solid fa-hammer"></i> Workload
          </a>
        </li>
        <li class="nav-item me-3">
          <a class="nav-link {$page.url.pathname === '/planning' ? 'active' : ''}" href="/planning">
            <i class="fa-solid fa-calendar"></i> Planner
          </a>
        </li>
        <li class="nav-item me-3">
          <a class="nav-link {$page.url.pathname.startsWith('/profiles') ? 'active' : ''}" href="/profiles">
            <i class="fa-solid fa-user"></i> Profiles
          </a>
        </li>
        <li class="nav-item me-3">
          <a class="nav-link {$page.url.pathname.startsWith('/totals') ? 'active' : ''}" href="/totals">
            <i class="fa-solid fa-hashtag"></i> Totals
          </a>
        </li>
        <li class="nav-item me-3">
          <a class="nav-link {$page.url.pathname.startsWith('/logout') ? 'active' : ''}" href="/logout">
            <i class="fa-solid fa-right-from-bracket"></i> Logout
          </a>
        </li>
      </ul>
    </div>
  </nav>
{/if}
<main class="container-fluid p-3">
  {@render children?.()}
</main>

<style>
  .brand-highlight {
    color: #42b4ff;
  }
  .nav-link {
    opacity: 0.85;
  }
  .active {
    color: #42b4ff !important;
    border-bottom: 2px solid #42b4ff;
    font-weight: bold;
  }
</style>
