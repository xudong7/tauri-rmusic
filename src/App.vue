<script setup>

</script>

<template>
  <div class="app-container">
    <header class="app-header">
      <h1>RMusic</h1>
      <nav class="app-nav">
        <router-link to="/">本地音乐</router-link>
        <router-link to="/netease">网易云</router-link>
      </nav>
    </header>
    
    <main class="app-content">
      <router-view></router-view>
    </main>
    
    <!-- <footer class="app-footer">
      <p>© 2025 RMusic - 基于Tauri和Vue的音乐播放器</p>
    </footer> -->
  </div>
</template>

<style>
body {
  margin: 0;
  padding: 0;
  font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
  color: #333;
}

.app-container {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.app-header {
  background-color: #1890ff;
  color: white;
  padding: 10px 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.app-nav {
  display: flex;
  gap: 20px;
}

.app-nav a {
  color: white;
  text-decoration: none;
  padding: 8px 12px;
  border-radius: 4px;
  transition: background-color 0.3s;
}

.app-nav a:hover {
  background-color: rgba(255, 255, 255, 0.2);
}

.app-nav a.router-link-active {
  background-color: rgba(255, 255, 255, 0.3);
  font-weight: bold;
}

.app-content {
  flex: 1;
  padding: 20px;
}

/* .app-footer {
  background-color: #f7f7f7;
  padding: 15px;
  text-align: center;
  font-size: 0.9em;
  color: #666;
  border-top: 1px solid #eee;
} */
</style>
