import { Router } from "express";
import { z } from "zod";
import { getAuthenticatedUser } from "../auth.js";
import { createTodo, createTodoList, getSharedTodoList, getTodoList, listTodoLists, renameTodoList, setTodoCompleted } from "../todoRepository.js";

export const todoRouter = Router();
const owner = (req: Parameters<typeof getAuthenticatedUser>[0]) => getAuthenticatedUser(req)!.email;
const titleSchema = z.object({ title: z.string().trim().min(1).max(120) });

todoRouter.get("/todo-lists", (req, res) => res.json({ todoLists: listTodoLists(owner(req)), sharedTodoList: getSharedTodoList() }));
todoRouter.post("/todo-lists", (req, res, next) => { try { res.status(201).json({ todoList: createTodoList(owner(req), titleSchema.parse(req.body).title) }); } catch (error) { next(error); } });
todoRouter.get("/todo-lists/:id", (req, res) => { const todoList = getTodoList(owner(req), req.params.id); if (!todoList) return res.status(404).json({ error: "To-do list not found" }); res.json({ todoList }); });
todoRouter.patch("/todo-lists/:id", (req, res, next) => { try { const todoList = renameTodoList(owner(req), req.params.id, titleSchema.parse(req.body).title); if (!todoList) return res.status(404).json({ error: "To-do list not found" }); res.json({ todoList }); } catch (error) { next(error); } });
todoRouter.post("/todo-lists/:id/todos", (req, res, next) => { try { const { text } = z.object({ text: z.string().trim().min(1).max(500) }).parse(req.body); const todo = createTodo(owner(req), req.params.id, text); if (!todo) return res.status(404).json({ error: "To-do list not found" }); res.status(201).json({ todo }); } catch (error) { next(error); } });
todoRouter.patch("/todos/:id", (req, res, next) => { try { const { completed } = z.object({ completed: z.boolean() }).parse(req.body); const todo = setTodoCompleted(owner(req), req.params.id, completed); if (!todo) return res.status(404).json({ error: "To-do not found" }); res.json({ todo }); } catch (error) { next(error); } });
