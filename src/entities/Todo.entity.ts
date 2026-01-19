/**
 * Todo.entity.ts
 *
 * TypeORM Entity for Todo table.
 * This entity maps to the todos table in the database.
 */
import { Entity, PrimaryColumn, Column, ManyToOne, JoinColumn, ManyToMany, JoinTable } from 'typeorm';
import { User } from './User.entity.js';
import { Project } from './Project.entity.js';
import { Tag } from './Tag.entity.js';
import { TodoDependency } from './TodoDependency.entity.js';

@Entity('todos')
export class Todo {
  @PrimaryColumn({ type: 'text' })
  id!: string;

  @Column({ type: 'text' })
  username!: string;

  @Column({ type: 'text' })
  title!: string;

  @Column({ type: 'text' })
  priority!: string;

  @Column({ type: 'text' })
  description!: string;

  @Column({ type: 'text', nullable: true })
  completedAt!: string | null;

  @Column({ type: 'text', nullable: true })
  projectId!: string | null;

  @Column({ type: 'text' })
  createdAt!: string;

  @Column({ type: 'text' })
  updatedAt!: string;

  // Relationships
  @ManyToOne(() => User, user => user.todos, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'username' })
  user!: User;

  @ManyToOne(() => Project, project => project.todos, { nullable: true })
  @JoinColumn({ name: 'projectId' })
  project!: Project | null;

  @ManyToMany(() => Tag, tag => tag.todos, { cascade: true })
  tags!: Tag[];

  @ManyToMany(() => Todo, todo => todo.blockedBy, { cascade: true })
  @JoinTable({
    name: 'todo_dependencies',
    joinColumn: { name: 'blocked_todo_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'blocker_todo_id', referencedColumnName: 'id' }
  })
  blockers!: Todo[];

  @ManyToMany(() => Todo, todo => todo.blockers)
  blockedBy!: Todo[];
}
