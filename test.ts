import { createClient } from "./src/index";

async function test() {
  const api = createClient({
    baseURL: "https://jsonplaceholder.typicode.com",
  });

  // Test GET
  //   const todo = await api.get("/todos/1");
  //   console.log("Todo:", todo);

  // Test POST (if you implement it)
  const post = await api.post("/posts", { title: "test" });
  console.log("Post:", post);
}

test();
