import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router = Router();
const prisma = new PrismaClient();

// Validation schemas
const createTaskSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200, 'Title is too long'),
  description: z.string().max(1000, 'Description is too long').optional(),
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
  dueDate: z.string().datetime().optional().nullable(),
});

const updateTaskSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200, 'Title is too long').optional(),
  description: z.string().max(1000, 'Description is too long').optional().nullable(),
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
  dueDate: z.string().datetime().optional().nullable(),
});

// All routes require authentication
router.use(authenticate);

// GET /tasks — paginated list with filtering and searching
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 10));
    const status = req.query.status as string | undefined;
    const search = req.query.search as string | undefined;
    const priority = req.query.priority as string | undefined;
    const sortBy = (req.query.sortBy as string) || 'createdAt';
    const sortOrder = (req.query.sortOrder as string) === 'asc' ? 'asc' : 'desc';

    const skip = (page - 1) * limit;

    // Build where clause
    const where: any = { userId: req.user!.userId };

    if (status && ['PENDING', 'IN_PROGRESS', 'COMPLETED'].includes(status)) {
      where.status = status;
    }

    if (priority && ['LOW', 'MEDIUM', 'HIGH'].includes(priority)) {
      where.priority = priority;
    }

    if (search) {
      where.title = { contains: search };
    }

    // Build orderBy
    const validSortFields = ['createdAt', 'updatedAt', 'title', 'dueDate', 'priority', 'status'];
    const orderByField = validSortFields.includes(sortBy) ? sortBy : 'createdAt';

    const [tasks, total] = await Promise.all([
      prisma.task.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [orderByField]: sortOrder },
      }),
      prisma.task.count({ where }),
    ]);

    res.json({
      tasks,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: page * limit < total,
      },
    });
  } catch (error) {
    console.error('Get tasks error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /tasks — create a new task
router.post('/', validate(createTaskSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const { title, description, status, priority, dueDate } = req.body;

    const task = await prisma.task.create({
      data: {
        title,
        description: description || null,
        status: status || 'PENDING',
        priority: priority || 'MEDIUM',
        dueDate: dueDate ? new Date(dueDate) : null,
        userId: req.user!.userId,
      },
    });

    res.status(201).json({ message: 'Task created successfully', task });
  } catch (error) {
    console.error('Create task error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /tasks/:id — get a single task
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const taskId = parseInt(req.params.id as string);
    if (isNaN(taskId)) {
      res.status(400).json({ error: 'Invalid task ID' });
      return;
    }

    const task = await prisma.task.findFirst({
      where: { id: taskId, userId: req.user!.userId },
    });

    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    res.json({ task });
  } catch (error) {
    console.error('Get task error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /tasks/:id — update a task
router.patch('/:id', validate(updateTaskSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const taskId = parseInt(req.params.id as string);
    if (isNaN(taskId)) {
      res.status(400).json({ error: 'Invalid task ID' });
      return;
    }

    // Check ownership
    const existingTask = await prisma.task.findFirst({
      where: { id: taskId, userId: req.user!.userId },
    });

    if (!existingTask) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    const { title, description, status, priority, dueDate } = req.body;

    const updateData: any = {};
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (status !== undefined) updateData.status = status;
    if (priority !== undefined) updateData.priority = priority;
    if (dueDate !== undefined) updateData.dueDate = dueDate ? new Date(dueDate) : null;

    const task = await prisma.task.update({
      where: { id: taskId },
      data: updateData,
    });

    res.json({ message: 'Task updated successfully', task });
  } catch (error) {
    console.error('Update task error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /tasks/:id — delete a task
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const taskId = parseInt(req.params.id as string);
    if (isNaN(taskId)) {
      res.status(400).json({ error: 'Invalid task ID' });
      return;
    }

    // Check ownership
    const existingTask = await prisma.task.findFirst({
      where: { id: taskId, userId: req.user!.userId },
    });

    if (!existingTask) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    await prisma.task.delete({ where: { id: taskId } });

    res.json({ message: 'Task deleted successfully' });
  } catch (error) {
    console.error('Delete task error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /tasks/:id/toggle — toggle task status
router.patch('/:id/toggle', async (req: Request, res: Response): Promise<void> => {
  try {
    const taskId = parseInt(req.params.id as string);
    if (isNaN(taskId)) {
      res.status(400).json({ error: 'Invalid task ID' });
      return;
    }

    const existingTask = await prisma.task.findFirst({
      where: { id: taskId, userId: req.user!.userId },
    });

    if (!existingTask) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    // Toggle status: PENDING -> IN_PROGRESS -> COMPLETED -> PENDING
    const statusMap: Record<string, string> = {
      PENDING: 'IN_PROGRESS',
      IN_PROGRESS: 'COMPLETED',
      COMPLETED: 'PENDING',
    };

    const newStatus = statusMap[existingTask.status] || 'PENDING';

    const task = await prisma.task.update({
      where: { id: taskId },
      data: { status: newStatus },
    });

    res.json({ message: 'Task status toggled successfully', task });
  } catch (error) {
    console.error('Toggle task error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
