/**
 * TodoDependency.entity.ts
 *
 * TypeORM Entity for TodoDependency junction table.
 * This entity maps to the todo_dependencies table for managing task blocking relationships.
 * It's a junction table for the self-referential many-to-many relationship in Todo.
 */
import {
  Entity,
  PrimaryColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Relation,
  UpdateDateColumn,
} from 'typeorm';
import { Todo } from './Todo.entity.js';

@Entity('todo_dependencies')
export class TodoDependency {
  @PrimaryColumn({ type: 'text', name: 'blocked_todo_id' })
  blockedTodoId!: string;

  @PrimaryColumn({ type: 'text', name: 'blocker_todo_id' })
  blockerTodoId!: string;

  @UpdateDateColumn({
    type: 'datetime',
    default: () => 'CURRENT_TIMESTAMP',
  })
  createdAt!: string;

  // Relationships
  @ManyToOne(() => Todo, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'blocked_todo_id' })
  blockedTodo!: Relation<Todo>;

  @ManyToOne(() => Todo, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'blocker_todo_id' })
  blockerTodo!: Relation<Todo>;
}
