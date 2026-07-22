import { Router } from "express";
import { z } from "zod";
import { getAuthenticatedUser } from "../auth.js";
import { createTodo, listTodos, setTodoCompleted } from "../todoRepository.js";

export const todoRouter = Router();
const owner = (req: Parameters<typeof getAuthenticatedUser>[0]) => getAuthenticatedUser(req)!.email;

todoRouter.get("/todos", (req, res) => res.json({ todos: listTodos(owner(req)) }));
todoRouter.post("/todos", (req, res, next) => { try { const { text } = z.object({ text: z.string().trim().min(1).max(500) }).parse(req.body); res.status(201).json({ todo: createTodo(owner(req), text) }); } catch (error) { next(error); } });
todoRouter.patch("/todos/:id", (req, res, next) => { try { const { completed } = z.object({ completed: z.boolean() }).parse(req.body); const todo = setTodoCompleted(owner(req), req.params.id, completed); if (!todo) return res.status(404).json({ error: "To-do not found" }); res.json({ todo }); } catch (error) { next(error); } });
